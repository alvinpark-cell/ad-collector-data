/**
 * 네이버 브랜드검색 스크래퍼 - PC / MO
 * 프리미엄형(키움): premium_list_item 구조
 * 일반형(메리츠): lightbutton btn_inner > a.btn 구조
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeNaverBrandsearch(brands, outputDir) {
  const results = [];
  const screenshotDir = path.join(outputDir, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const brand of brands) {
    console.log(`[네이버 브검] "${brand}" 수집 중...`);

    try {
      const pcResult = await collectBrandsearch(browser, brand, 'pc', screenshotDir);
      if (pcResult) console.log(`[네이버 브검 PC] "${brand}" 완료 (${pcResult.buttons.length}개 버튼)`);
      else console.log(`[네이버 브검 PC] "${brand}" 브랜드검색 없음`);
      if (pcResult) results.push(pcResult);
    } catch (e) { console.error(`[네이버 브검 PC] "${brand}" 오류:`, e.message); }

    await new Promise(r => setTimeout(r, 1500));

    try {
      const moResult = await collectBrandsearch(browser, brand, 'mo', screenshotDir);
      if (moResult) console.log(`[네이버 브검 MO] "${brand}" 완료 (${moResult.buttons.length}개 버튼)`);
      else console.log(`[네이버 브검 MO] "${brand}" 브랜드검색 없음`);
      if (moResult) results.push(moResult);
    } catch (e) { console.error(`[네이버 브검 MO] "${brand}" 오류:`, e.message); }

    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
  return results;
}

// 캐러셀형 배너(premium_carousel 등)가 자동 재생 중이면 스크린샷 시점에 슬라이드가
// 전환 애니메이션 중간(예: translate(-1015.9px) 같은 소수점 중간값)일 수 있어 두 슬라이드가
// 겹쳐 찍히는 문제가 발생함. transform 인라인 스타일 값이 연속 2회(간격 200ms) 동일해질
// 때까지 최대 3초 대기 후 진행 (그래도 안정 안 되면 타임아웃으로 그냥 진행 - 무한 대기 방지).
async function waitForCarouselSettle(page, isMobile) {
  const maxAttempts = 15;
  let lastSnapshot = null;
  for (let i = 0; i < maxAttempts; i++) {
    const snapshot = await page.evaluate(function(isMobileArg) {
      var bx = isMobileArg
        ? document.querySelector('section.sp_brand, .api_subject_bx')
        : document.querySelector('.brand_search');
      if (!bx) return null;
      var els = bx.querySelectorAll('[style*="transform"]');
      var vals = [];
      els.forEach(function(el) { vals.push(el.style.transform); });
      return vals.join('|');
    }, isMobile);

    if (snapshot !== null && snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;
    await page.waitForTimeout(200);
  }
}

async function collectBrandsearch(browser, brand, device, screenshotDir) {
  const isMobile = device === 'mo';

  const contextOptions = {
    locale: 'ko-KR',
    viewport: isMobile ? { width: 390, height: 2200 } : { width: 1280, height: 1800 },
    userAgent: isMobile
      ? 'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    isMobile: isMobile,
    hasTouch: isMobile,
  };

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  const searchUrl = isMobile
    ? `https://m.search.naver.com/search.naver?query=${encodeURIComponent(brand)}`
    : `https://search.naver.com/search.naver?query=${encodeURIComponent(brand)}`;

  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // ── 1단계: 브검 존재 여부 확인 + 스크린샷 영역 탐지 ──────────────────────
  // (2026-07-29 재작성: 네이버가 프론트 구조를 바꿔서 예전 id 패턴은 더 이상 안 걸림.
  //  __ADFE_TEMPLATE_BLOCK__ 안의 블록 유형으로 "진짜 브랜드검색"인지 판별.
  //  실제 스크린샷 대조로 검증된 규칙(7/7 브랜드 정답 일치):
  //   - light_ / premium(image|video|bottom|link|story)_ 계열이 있으면 인정
  //     (처음엔 premium* 계열에 isbrand===true 조건을 추가로 걸었는데, 실제로는
  //      isbrand:false인데도 진짜 광고인 사례가 확인돼서 이 필드는 신뢰할 수 없음 -> 제거)
  //   - directlink_ 단독으로는 인정 안 함 (브랜드검색 없는 브랜드에도 항상 붙는 일반 정보카드라서)
  //   - pcPowerLink/shoppinglive/shortclip/bottomnotice/brandnews/brandchannel 등은 대상 제외
  //   - 위 어디에도 안 걸리는 새 블록 유형은 조용히 무시하지 않고 콘솔에 경고 로그)
  // (2026-07-29 추가 수정: PC와 MO는 프론트엔드 구조 자체가 달라서 브랜드검색 컨테이너의
  //  실제 클래스명이 다름. PC는 .api_subject_bx가 페이지 내 다른 무관한 섹션(파워링크 등)에도
  //  똑같이 붙어있어서 첫 번째 매치가 브랜드검색이 아닌 경우가 있었음 -> PC 전용 래퍼인
  //  .brand_search로 교체. MO는 이 클래스가 존재하지 않고 기존 section.sp_brand가 유효하므로 유지.)
  const detection = await page.evaluate(function(isMobileArg) {
    var bx = isMobileArg
      ? document.querySelector('section.sp_brand, .api_subject_bx')
      : document.querySelector('.brand_search');
    if (!bx) return { found: false };

    var adfe = window.__ADFE_TEMPLATE_BLOCK__;
    if (!adfe || typeof adfe !== 'object') return { found: false };

    var NON_BRAND_PREFIXES = [
      'directlink', 'brandnews', 'bottomnotice', 'pcPowerLink',
      'shoppinglive', 'shortclip', 'brandchannel', 'bottomscroll', 'bottomtriplelarge',
    ];

    var brandKeys = [];
    var unknownKeys = [];

    Object.keys(adfe).forEach(function(key) {
      var m = key.match(/^([a-zA-Z]+)_[0-9a-fA-F]{4,}$/);
      if (!m) return; // 랜덤 접미사 붙은 실제 인스턴스만 검사 (카테고리 나열용 bare 키는 무시)
      var prefix = m[1];
      var arr = adfe[key];
      if (!Array.isArray(arr) || arr.length === 0) return;

      if (prefix === 'light' || /^premium(image|wideimage|video|bottom|link|story)$/.test(prefix)) {
        brandKeys.push(key);
      } else if (NON_BRAND_PREFIXES.indexOf(prefix) !== -1) {
        // 알려진 비-브랜드검색 -> 지나감
      } else {
        unknownKeys.push(key);
      }
    });

    if (unknownKeys.length > 0) {
      console.log('[네이버 브검] 처음 보는 블록 유형 발견(허용목록 검토 필요): ' + unknownKeys.join(', '));
    }

    if (brandKeys.length === 0) return { found: false, unknownKeys: unknownKeys };

    var rect = bx.getBoundingClientRect();
    return {
      found: true,
      brandKeys: brandKeys,
      unknownKeys: unknownKeys,
      box: { x: rect.x, y: rect.top, width: rect.width, height: rect.height },
    };
  }, isMobile);

  if (!detection.found) {
    console.log(`  [${device.toUpperCase()}] 브랜드검색 없음`);
    await context.close();
    return null;
  }

  // ── 2단계: 스크린샷 영역을 콘텐츠 전체 높이로 재측정 ─────────────────────
  const fullBox = await page.evaluate(function(isMobileArg) {
    var bx = isMobileArg
      ? document.querySelector('section.sp_brand, .api_subject_bx')
      : document.querySelector('.brand_search');
    if (!bx) return null;

    // bottomnotice(법적 고지 긴 텍스트)는 순수 광고 크롭에서 제외
    var notice = bx.querySelector('[data-block-data-set="bottomNotice"]');
    var rect = bx.getBoundingClientRect();
    var bottom = rect.bottom;

    bx.querySelectorAll('*').forEach(function(el) {
      if (notice && (el === notice || notice.contains(el))) return;
      var r = el.getBoundingClientRect();
      if (r.bottom > bottom && r.width > 10) bottom = r.bottom;
    });

    // notice가 있으면 그 시작 지점을 넘지 않도록 상한선을 둠
    if (notice) {
      var noticeRect = notice.getBoundingClientRect();
      if (noticeRect.top < bottom) bottom = noticeRect.top;
    }

    return { x: rect.x, y: rect.top, width: rect.width, height: bottom - rect.top };
  }, isMobile);

  if (!fullBox || fullBox.height < 50) {
    await context.close();
    return null;
  }

  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const unique = Math.random().toString(36).slice(2,6);
  const screenshotFilename = `bs_${brand}_${device}_${date}_${unique}.png`;
  const screenshotPath = path.join(screenshotDir, screenshotFilename);

  const vpWidth = isMobile ? 390 : 1280;
  const neededHeight = Math.ceil(fullBox.y + fullBox.height) + 80;
  await page.setViewportSize({ width: vpWidth, height: Math.max(neededHeight, isMobile ? 2200 : 1800) });
  await page.waitForTimeout(500);

  // 캐러셀(premium_carousel 등)이 자동 재생 중이면 슬라이드 전환 애니메이션 중간에
  // 캡처되어 두 슬라이드가 겹쳐 찍히는 문제가 있음 -> transform 값이 연속 2회 동일할 때까지 대기
  await waitForCarouselSettle(page, isMobile);

  await page.screenshot({
    path: screenshotPath,
    clip: {
      x: Math.max(0, fullBox.x),
      y: Math.max(0, fullBox.y),
      width: Math.min(fullBox.width, vpWidth - Math.max(0, fullBox.x)),
      height: fullBox.height,
    },
  });

  console.log(`  [${device.toUpperCase()}] 스크린샷: ${screenshotFilename}`);

  // ── 3단계: __ADFE_TEMPLATE_BLOCK__ 에서 버튼 데이터 파싱 ─────────────────
  // (2026-07-29 재작성: 블록 "키 접두어" 기준으로 분기하는 방식으로 전환.
  //  이전엔 data shape(예: title+link 있으면 무조건 새소식)로 추측했는데,
  //  light_(메인배너) 블록의 mainText.title/link가 brandNews 체크에 잘못 걸려
  //  "설명문구"가 "새소식"으로 오분류되는 문제가 실제로 발견됨 -> prefix로 명확히 구분.
  //  영역 세분화(메리츠증권 실데이터 대조, 2026-07-29):
  //   light_ PC: mainImg(메인이미지)/mainText(설명문구)/subLinks(서브링크N)/products(썸네일N)
  //   light_ MO: img+imgLink(메인이미지)/title+link(설명문구)/thumbnails(썸네일N)
  //   lightbutton_ (MO 전용, PC의 subLinks에 대응하는 별도 블록): menu3.menu(서브링크N)
  const buttons = await page.evaluate(function() {
    var results = [];
    var seen = new Set();

    function addButton(text, href, area, slideInfo) {
      if (!href || !text) return;
      // ader.naver.com 리다이렉트에서 실제 URL 추출
      var finalUrl = href;
      try {
        if (href.includes('ader.naver.com') || href.includes('m_adtouch_custom_url')) {
          // m_adtouch_custom_url 파라미터에서 실제 랜딩 URL 추출
          var customUrlMatch = href.match(/m_adtouch_custom_url=([^&]+)/);
          if (customUrlMatch) {
            finalUrl = decodeURIComponent(customUrlMatch[1]);
          }
        }
      } catch(_) {}
      if (!finalUrl) return;
      var areaLabel = area || '기타';
      // 같은 영역에 동일 URL이 중복 등록되는 것만 방지 (다른 영역이 같은 URL을 공유하는 건 허용 -
      // 예: 메인이미지와 설명문구가 같은 이벤트 페이지로 연결되는 경우가 실제로 있음)
      var dedupKey = areaLabel + '::' + finalUrl;
      if (seen.has(dedupKey)) return;
      var extra = slideInfo ? {
        slideIndex: slideInfo.index,
        slideImageUrl: slideInfo.imgUrl,
        slideTitle: slideInfo.title,
        slideSubText: slideInfo.subText,
      } : {};
      if (finalUrl.startsWith('tel:')) {
        seen.add(dedupKey);
        results.push(Object.assign({ text: text.trim().slice(0,40), href: finalUrl, area: areaLabel }, extra));
        return;
      }
      if (!finalUrl.startsWith('http')) return;
      seen.add(dedupKey);
      results.push(Object.assign({ text: text.trim().slice(0,40), href: finalUrl, area: areaLabel }, extra));
    }

    // premium* 계열(캐러셀/메인배너) 공통 파싱 - 최상위 블록과 _blocks.next 재귀 양쪽에서 재사용
    function parsePremiumShape(data) {
      // imgGallery: PC·MO 공통 캐러셀 구조. 슬라이드가 2장 이상이면 번호를 붙이고,
      // 1장뿐이면 번호 없이 '메인이미지'만 사용
      if (Array.isArray(data.imgGallery)) {
        var galleryLen = data.imgGallery.length;
        data.imgGallery.forEach(function(item, idx) {
          var titleArr = item.content && item.content.content2 && item.content.content2.title;
          var btnText = item.btnText || (titleArr ? titleArr.join(' ') : '');
          var imgUrl = item.img ? (item.img.uri || item.img.originalUri) : null;
          var areaLabel = galleryLen > 1 ? ('메인이미지' + (idx + 1)) : '메인이미지';
          if (item.link) {
            addButton(btnText || areaLabel, item.link, areaLabel, {
              index: idx,
              imgUrl: imgUrl,
              title: titleArr ? titleArr.join(' ') : (btnText || ''),
              subText: item.content && item.content.content2 ? item.content.content2.subText : '',
            });
          }
        });
      }

      // premiumWideImage: MO 전용, 이미지 한 장 + 버튼 여러 개(같은 이미지를 공유)
      if (data.main && data.main.img && Array.isArray(data.buttons)) {
        var wideImgUrl = data.main.img.uri || data.main.img.originalUri;
        data.buttons.forEach(function(btn, idx) {
          if (btn.text && btn.link) {
            addButton(btn.text, btn.link, '메인이미지', {
              index: idx,
              imgUrl: wideImgUrl,
              title: btn.text,
              subText: '',
            });
          }
        });
      }
    }

    var adfe = window.__ADFE_TEMPLATE_BLOCK__;
    if (adfe && typeof adfe === 'object') {
      Object.keys(adfe).forEach(function(blockKey) {
        var blockArr = adfe[blockKey];
        if (!Array.isArray(blockArr)) return;
        var prefixMatch = blockKey.match(/^([a-zA-Z]+)_[0-9a-fA-F]{4,}$/);
        var prefix = prefixMatch ? prefixMatch[1] : blockKey;

        blockArr.forEach(function(entry) {
          if (!Array.isArray(entry) || entry.length < 2) return;
          var data = entry[1]; // 두 번째 요소가 실제 데이터
          if (!data || typeof data !== 'object') return;

          // ── directLink: 홈페이지 링크 (필드명이 브랜드마다 logoText/slogan으로 다름) ──
          if (prefix === 'directlink') {
            if (data.link) {
              var homeText = data.logoText ? (data.logoText + ' 홈페이지') : (data.slogan || '홈페이지');
              addButton(homeText, data.link, '홈페이지');
            }
            return;
          }

          // ── brandNews: 이벤트/새소식 링크 ──
          if (prefix === 'brandnews') {
            if (data.title && data.link) addButton(data.title, data.link, '브랜드소식');
            return;
          }

          // ── light_: 메인배너형(캐러셀 아닌 고정 배너 + 설명문구 + 서브링크 + 썸네일) ──
          // PC/MO가 완전히 다른 필드 구조를 쓰므로 두 형태를 모두 체크
          if (prefix === 'light') {
            // PC 형태: mainImg / mainText / subLinks / products
            if (data.mainImg && data.mainImg.link) {
              addButton(data.mainImg.bottomText || '메인이미지', data.mainImg.link, '메인이미지');
            }
            if (data.mainText && data.mainText.link) {
              addButton(data.mainText.title || '설명문구', data.mainText.link, '설명문구');
            }
            if (Array.isArray(data.subLinks)) {
              data.subLinks.forEach(function(sl, idx) {
                var label = '서브링크' + (idx + 1);
                if (sl.link) addButton(sl.text || label, sl.link, label);
              });
            }
            if (Array.isArray(data.products)) {
              data.products.forEach(function(p, idx) {
                var label = '썸네일' + (idx + 1);
                if (p.link) addButton(p.name || label, p.link, label);
              });
            }

            // MO 형태: img/imgLink(메인이미지) + title/subtitle/link(설명문구) + thumbnails
            if (data.imgLink) {
              addButton(data.subtitle || data.title || '메인이미지', data.imgLink, '메인이미지');
            }
            if (data.link && (data.title || data.subtitle) && !data.mainText) {
              addButton(data.title || data.subtitle, data.link, '설명문구');
            }
            if (Array.isArray(data.thumbnails)) {
              data.thumbnails.forEach(function(t, idx) {
                var label = '썸네일' + (idx + 1);
                if (t.link) addButton(t.text || label, t.link, label);
              });
            }
            return;
          }

          // ── lightbutton_: MO 전용, light_의 PC subLinks에 대응하는 별도 블록 ──
          if (prefix === 'lightbutton') {
            if (data.menu3 && Array.isArray(data.menu3.menu)) {
              data.menu3.menu.forEach(function(m, idx) {
                var label = '서브링크' + (idx + 1);
                if (m.link) addButton(m.text || label, m.link, label);
              });
            }
            return;
          }

          // ── bottomScroll: 하단 아이콘형 썸네일 리스트 ──
          if (prefix === 'bottomscroll') {
            if (Array.isArray(data.items)) {
              data.items.forEach(function(item, idx) {
                var label = '썸네일' + (idx + 1);
                if (item.text && item.link) addButton(item.text, item.link, label);
              });
            }
            return;
          }

          // ── bottomTripleLargeTab: 탭으로 구분된 썸네일 그룹 ──
          if (prefix === 'bottomtriplelargetab') {
            if (Array.isArray(data.tabs)) {
              data.tabs.forEach(function(tab, tabIdx) {
                if (Array.isArray(tab.items)) {
                  tab.items.forEach(function(item, itemIdx) {
                    var label = '탭' + (tabIdx + 1) + ' 썸네일' + (itemIdx + 1);
                    if (item.text && item.link) addButton(item.text, item.link, label);
                  });
                }
              });
            }
            return;
          }

          // ── bottomTripleLarge: 탭 없는 하단 카드 행. 맨 아래 별도 추천/캠페인 섹션과
          // 시각적으로 유사해 '다이나믹 썸네일'로 구분 (일반 썸네일과 다른 블록) ──
          if (prefix === 'bottomtriplelarge') {
            if (Array.isArray(data.single)) {
              data.single.forEach(function(item, idx) {
                var label = '다이나믹 썸네일' + (idx + 1);
                if (item.text && item.link) addButton(item.text, item.link, label);
              });
            }
            return;
          }

          // ── premium* 계열 (캐러셀/메인배너, PC·MO 공통) ──
          if (/^premium(image|wideimage|video|bottom|link|story)$/.test(prefix)) {
            parsePremiumShape(data);

            // _blocks.next 안의 데이터도 재귀적으로 처리 (네이버 블록 체인 구조)
            if (data._blocks && data._blocks.next && data._blocks.next.data) {
              parsePremiumShape(data._blocks.next.data);
            }
            return;
          }
        });
      });
    }

    // fallback: ADFE 파싱 실패 시 DOM에서 직접 추출
    if (results.length === 0) {
      console.log('[fallback] DOM 직접 파싱');
      var bx = document.querySelector('.api_subject_bx, section.sp_brand');
      if (bx) {
        bx.querySelectorAll('a[href]').forEach(function(a) {
          var href = a.href || '';
          var text = (a.innerText || a.textContent || '').trim().replace(/\s+/g,' ').slice(0,40);
          if (!href || !text) return;
          if (href.includes('naver.com/search') || href.includes('javascript:')) return;
          // ader.naver.com에서 실제 URL 추출
          var finalUrl = href;
          try {
            if (href.includes('ader.naver.com')) {
              // onclick에서 원본 URL 추출 시도
              var onclick = a.getAttribute('onclick') || '';
              var urlMatch = onclick.match(/urlencode\(this\.href\)/);
              if (!urlMatch) {
                // href 자체가 ader 리다이렉트면 그대로 사용 (랜딩 캡처 시 리다이렉트 따라감)
                finalUrl = href;
              }
            }
          } catch(_) {}
          var dedupKey = '기타::' + finalUrl;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            results.push({ text: text, href: finalUrl, area: '기타' });
          }
        });
      }
    }

    return results.slice(0, 25);
  });

  console.log(`  [${device.toUpperCase()}] 버튼 ${buttons.length}개 추출 (ADFE 파싱)`);
  if (buttons.length > 0) {
    buttons.forEach(function(b) { console.log(`    - ${b.text}: ${b.href.slice(0,60)}`); });
  }

  await context.close();

  // ── 4단계: 랜딩 캡처 ──────────────────────────────────────────────────────
  // 랜딩 캡처는 별도 브라우저 context에서 처리 (context 이미 닫혔으므로 새로 열기)
  const landingContext = await browser.newContext({
    locale: 'ko-KR',
    viewport: isMobile ? { width: 390, height: 900 } : { width: 1280, height: 900 },
    userAgent: isMobile
      ? 'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    isMobile: isMobile,
    hasTouch: isMobile,
  });

  const landingData = await captureLandings(landingContext, buttons, brand, device, screenshotDir, isMobile);
  await landingContext.close();

  return buildResult(brand, device, screenshotFilename, landingData);
}

// 프리미엄형 (키움증권 스타일) 캡처
async function capturePremium(page, containerId, brand, device, screenshotDir, isMobile) {
  // premium_list_item(버튼 리스트)이 렌더될 때까지 최대 8초 대기
  // 영상이 먼저 로드되고 버튼 리스트는 JS로 뒤늦게 렌더링되는 구조 대응
  try {
    await page.waitForSelector(`#${containerId} .premium_list_item`, { timeout: 8000 });
  } catch (e) {
    console.log(`  [주의] premium_list_item 셀렉터 대기 타임아웃 - 현재 DOM으로 진행`);
  }

  // 추가 렌더링 안정화 대기 (레이아웃 확정)
  await page.waitForTimeout(800);

  // premiumvideo_ 컨테이너 전체(영상+버튼리스트 포함)의 영역을 재측정
  // getBoundingClientRect 대신 offsetTop/scrollHeight 기반으로 실제 렌더 높이 측정
  const fullBox = await page.evaluate(function(cid) {
    var premiumDiv = document.getElementById(cid);
    if (!premiumDiv) return null;
    var rect = premiumDiv.getBoundingClientRect();

    // 버튼 리스트가 컨테이너 밖에 인접한 형제 노드로 렌더될 수 있는 경우도 커버
    // 실제 하단 경계: 컨테이너 자신 + 바로 다음 형제 중 premium_list 관련 요소까지 포함
    var bottom = rect.bottom;
    var sibling = premiumDiv.nextElementSibling;
    while (sibling) {
      if (sibling.querySelector && sibling.querySelector('.premium_list_item, [class*="premium_list"]')) {
        var sibRect = sibling.getBoundingClientRect();
        if (sibRect.bottom > bottom) bottom = sibRect.bottom;
      }
      sibling = sibling.nextElementSibling;
    }

    var height = bottom - rect.top;
    return { x: rect.x, y: rect.top, width: rect.width, height: height };
  }, containerId);

  if (!fullBox || fullBox.height < 50) return null;

  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const unique = Math.random().toString(36).slice(2,6);
  const screenshotFilename = `bs_${brand}_${device}_${date}_${unique}.png`;
  const screenshotPath = path.join(screenshotDir, screenshotFilename);

  // clip이 뷰포트 밖에 걸리면 Playwright가 조용히 잘라버리므로,
  // 캡처 전 뷰포트 높이를 콘텐츠 하단까지 충분히 늘려줌
  const vpWidth = isMobile ? 390 : 1280;
  const neededHeight = Math.ceil(fullBox.y + fullBox.height) + 50;
  await page.setViewportSize({ width: vpWidth, height: Math.max(neededHeight, isMobile ? 2200 : 1800) });

  await page.screenshot({
    path: screenshotPath,
    clip: {
      x: Math.max(0, fullBox.x),
      y: Math.max(0, fullBox.y),
      width: Math.min(fullBox.width, vpWidth - Math.max(0, fullBox.x)),
      height: fullBox.height,
    },
  });

  // premium_list_item 버튼들 추출
  const buttons = await page.evaluate(function(cid) {
    var premiumDiv = document.getElementById(cid);
    if (!premiumDiv) return [];
    var items = [];
    var seen = new Set();

    premiumDiv.querySelectorAll('.premium_list_item').forEach(function(li) {
      var a = li.querySelector('a[href]');
      if (!a) return;
      var href = a.href;
      if (!href || seen.has(href)) return;
      seen.add(href);
      // 버튼 안의 텍스트 (보통 두 줄: 타이틀 + 서브타이틀)
      var textParts = [];
      li.querySelectorAll('span, strong, div').forEach(function(el) {
        var t = el.innerText && el.innerText.trim();
        if (t && t.length < 30 && !textParts.includes(t)) textParts.push(t);
      });
      var text = textParts.length > 0 ? textParts.join(' ') : (li.innerText || '').trim().replace(/\n/g, ' ');
      items.push({ text: text.slice(0, 40) || '버튼', href: href });
    });

    return items;
  }, containerId);

  return { screenshotFilename, buttons };
}

// 이미지 슬라이드형 (미래에셋증권 스타일) 캡처
// containerId가 없을 수 있으므로 containerClass 기반으로 찾음
async function captureSlide(page, containerId, containerClass, brand, device, screenshotDir, isMobile) {
  await page.waitForTimeout(1500);

  const fullBox = await page.evaluate(function(args) {
    var el = null;

    // MO: 실제 확인된 id 패턴으로 먼저 찾기
    if (args.mobileContainerId) {
      var mEl = document.getElementById(args.mobileContainerId);
      if (mEl) {
        // 이 요소를 포함하는 api_subject_bx 전체를 캡처 대상으로 사용
        var apiBx = mEl.closest('.api_subject_bx');
        if (apiBx) el = apiBx;
        else el = mEl.parentElement || mEl;
      }
    }

    // containerId로 직접 찾기
    if (!el && args.cid) el = document.getElementById(args.cid);

    // class 기반 fallback
    if (!el) {
      var selectors = [
        '[id^="directlink_"]', '[id^="brandnews_"]', '[id^="premiumstory_"]', '[id^="bottomscroll_"]',
        '.brand_search_wrap', '.bs_wrap', '[class*="brand_s"]', '[id^="sp_"]', '[id^="bs_"]',
      ];
      for (var i = 0; i < selectors.length; i++) {
        var found = document.querySelector(selectors[i]);
        if (found) {
          var apiBx2 = found.closest('.api_subject_bx');
          el = apiBx2 || found;
          break;
        }
      }
    }

    // 광고 표시 기반 최후 fallback
    if (!el) {
      var adMark = document.querySelector('.ad_mark, .lable_ad, [class*="ad_mark"]');
      if (!adMark) {
        var spans = document.querySelectorAll('span, em, div');
        for (var s = 0; s < spans.length; s++) {
          if ((spans[s].innerText || '').trim() === '광고') { adMark = spans[s]; break; }
        }
      }
      if (adMark) {
        var node = adMark;
        for (var d = 0; d < 10; d++) {
          if (!node.parentElement) break;
          node = node.parentElement;
          if (node.querySelector('img') && node.querySelectorAll('a').length > 1) { el = node; break; }
        }
      }
    }

    if (!el) return null;

    var rect = el.getBoundingClientRect();
    var bottom = rect.bottom;
    el.querySelectorAll('a').forEach(function(a) {
      var r = a.getBoundingClientRect();
      if (r.bottom > bottom) bottom = r.bottom;
    });
    return { x: rect.x, y: rect.top, width: rect.width, height: bottom - rect.top };
  }, { cid: containerId, mobileContainerId: arguments[7] || null });

  if (!fullBox || fullBox.height < 50) {
    console.log(`  [${device.toUpperCase()}] 슬라이드형 컨테이너 측정 실패`);
    return null;
  }

  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const unique = Math.random().toString(36).slice(2,6);
  const screenshotFilename = `bs_${brand}_${device}_${date}_${unique}.png`;
  const screenshotPath = path.join(screenshotDir, screenshotFilename);

  const vpWidth = isMobile ? 390 : 1280;
  const neededHeight = Math.ceil(fullBox.y + fullBox.height) + 50;
  await page.setViewportSize({ width: vpWidth, height: Math.max(neededHeight, isMobile ? 2200 : 1800) });

  await page.screenshot({
    path: screenshotPath,
    clip: {
      x: Math.max(0, fullBox.x),
      y: Math.max(0, fullBox.y),
      width: Math.min(fullBox.width, vpWidth - Math.max(0, fullBox.x)),
      height: fullBox.height,
    },
  });

  // 버튼/링크 추출 - MO는 mobileContainerId 기준 api_subject_bx 전체에서 찾기
  const buttons = await page.evaluate(function(args) {
    var el = null;

    // MO: mobileContainerId로 찾아서 api_subject_bx 전체 범위 사용
    if (args.mobileContainerId) {
      var mEl = document.getElementById(args.mobileContainerId);
      if (mEl) {
        var apiBx = mEl.closest('.api_subject_bx');
        el = apiBx || mEl.parentElement || mEl;
      }
    }

    // containerId로 직접 찾기
    if (!el && args.cid) el = document.getElementById(args.cid);

    // 실제 DOM 패턴 기반 셀렉터
    if (!el) {
      var selectors = [
        '[id^="directlink_"]', '[id^="brandnews_"]', '[id^="premiumstory_"]', '[id^="bottomscroll_"]',
        '.brand_search_wrap', '.bs_wrap', '[class*="brand_s"]', '[id^="sp_"]', '[id^="bs_"]',
      ];
      for (var i = 0; i < selectors.length; i++) {
        var found = document.querySelector(selectors[i]);
        if (found) {
          var apiBx2 = found.closest('.api_subject_bx');
          el = apiBx2 || found;
          break;
        }
      }
    }

    if (!el) return [];

    var items = [], seen = new Set();
    el.querySelectorAll('a[href]').forEach(function(a) {
      var href = a.href;
      if (!href || seen.has(href)) return;
      // 네이버 내부 링크 제외
      if (href.includes('naver.com/search') || href.includes('naver.com/main') ||
          href.includes('javascript:') || href === '#') return;
      seen.add(href);
      var text = (a.innerText || a.textContent || '').trim().replace(/\s+/g,' ').slice(0, 40);
      if (text) items.push({ text: text, href: href });
    });
    return items.slice(0, 10);
  }, { cid: containerId, mobileContainerId: mobileContainerId });

  console.log(`  [${device.toUpperCase()}] 슬라이드형 캡처 완료: ${screenshotFilename} (버튼 ${buttons.length}개)`);
  return { screenshotFilename, buttons };
}

// 일반형 (메리츠증권 스타일) 캡처
async function captureGeneral(page, containerId, brand, device, screenshotDir, isMobile) {
  let targetId = containerId;
  if (!targetId) {
    // containerId 없으면 api_subject_bx 전체 사용
    const box = await page.evaluate(function() {
      var el = document.querySelector('div.api_subject_bx');
      if (!el) return null;
      var rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    if (!box || box.height < 50) return null;

    const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const unique = Math.random().toString(36).slice(2,6);
    const screenshotFilename = `bs_${brand}_${device}_${date}_${unique}.png`;
    const screenshotPath = path.join(screenshotDir, screenshotFilename);
    await page.screenshot({ path: screenshotPath, clip: { x: Math.max(0,box.x), y: Math.max(0,box.y), width: box.width, height: box.height } });

    const buttons = await page.evaluate(function() {
      var el = document.querySelector('div.api_subject_bx');
      if (!el) return [];
      var items = [];
      var seen = new Set();
      el.querySelectorAll('a.btn[href], a.main_title[href]').forEach(function(a) {
        var href = a.href;
        if (!href || seen.has(href)) return;
        seen.add(href);
        var text = (a.innerText || '').trim();
        items.push({ text: text.slice(0, 40) || '버튼', href: href });
      });
      return items;
    });

    return { screenshotFilename, buttons };
  }

  // light_ 컨테이너 기준 메인 브랜드 블록
  const box = await page.evaluate(function(cid) {
    var lightDiv = document.getElementById(cid);
    if (!lightDiv) return null;
    var mainBlock = lightDiv.querySelector('[class*="brand_block"][class*="brand_inner"]') || lightDiv;
    var rect = mainBlock.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, targetId);

  if (!box || box.height < 50) return null;

  const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const unique = Math.random().toString(36).slice(2,6);
  const screenshotFilename = `bs_${brand}_${device}_${date}_${unique}.png`;
  const screenshotPath = path.join(screenshotDir, screenshotFilename);
  await page.screenshot({ path: screenshotPath, clip: { x: Math.max(0,box.x), y: Math.max(0,box.y), width: box.width, height: box.height } });

  // lightbutton_ 영역의 btn_inner > a.btn 들 추출 (실제 버튼)
  const buttons = await page.evaluate(function() {
    var items = [];
    var seen = new Set();

    // lightbutton으로 시작하는 모든 컨테이너 탐색
    document.querySelectorAll('[id^="lightbutton_"]').forEach(function(lb) {
      lb.querySelectorAll('a.btn[href]').forEach(function(a) {
        var href = a.href;
        if (!href || seen.has(href)) return;
        seen.add(href);
        var text = (a.innerText || '').trim();
        items.push({ text: text.slice(0, 40) || '버튼', href: href });
      });
    });

    // 메인 타이틀 링크도 포함
    var mainTitle = document.querySelector('a.main_title[href]');
    if (mainTitle && !seen.has(mainTitle.href)) {
      items.push({ text: (mainTitle.innerText || '메인 배너').trim().slice(0,40), href: mainTitle.href });
    }

    return items;
  });

  return { screenshotFilename, buttons };
}

// 랜딩 페이지 캡처 (네이버 리다이렉트 처리 + 에러페이지 필터 + 중복 방문 방지)
function buildLandingEntry(btn, cached) {
  return Object.assign({
    buttonText: btn.text,
    buttonUrl: btn.href,
    area: btn.area || '기타',
    finalUrl: cached.finalUrl,
    landingScreenshot: cached.landingScreenshot,
  }, btn.slideImageUrl ? {
    slideIndex: btn.slideIndex,
    slideImage: cached.slideImage || null,
    slideTitle: btn.slideTitle || '',
    slideSubText: btn.slideSubText || '',
  } : {});
}

// 영역 세분화(메인이미지/설명문구 등)로 버튼 개수가 늘면서, 서로 다른 영역이 동일한
// href를 공유하는 경우(예: 메인이미지와 설명문구가 같은 이벤트 페이지로 연결)가 생김.
// 이 경우 각 영역은 별도 카드로 보여줘야 하므로 결과에서 제외하지 않고, 대신 동일 href는
// 한 번만 실제 방문/스크린샷하고 캐시된 결과를 재사용해서 중복 방문 비용만 줄인다.
async function captureLandings(context, buttons, brand, device, screenshotDir, isMobile) {
  const landingData = [];
  const hrefCache = new Map(); // btn.href -> {finalUrl, landingScreenshot, slideImage} | 'SKIP'
  const unique = Math.random().toString(36).slice(2,6);

  for (const btn of buttons.slice(0, 20)) {
    if (!btn.href) continue;

    if (hrefCache.has(btn.href)) {
      const cached = hrefCache.get(btn.href);
      if (cached === 'SKIP') continue;
      landingData.push(buildLandingEntry(btn, cached));
      continue;
    }

    try {
      const landingPage = await context.newPage();
      await landingPage.goto(btn.href, { waitUntil: 'networkidle', timeout: 20000 });
      await landingPage.waitForTimeout(1800);
      const finalUrlCheck = landingPage.url();

      // 네이버 자체 페이지(로그인, 개발자문서 등)로 빠지면 스킵
      if (finalUrlCheck.includes('nid.naver.com') || finalUrlCheck.includes('developers.naver.com') ||
          finalUrlCheck.includes('help.naver.com')) {
        console.log(`    [건너뜀-네이버내부] ${btn.text}`);
        hrefCache.set(btn.href, 'SKIP');
        await landingPage.close();
        continue;
      }

      // 에러 페이지 필터
      const isErrorPage = await landingPage.evaluate(function() {
        var text = (document.body.innerText || '').slice(0, 500);
        var title = document.title || '';
        return /error|오류|에러\s*[:：]\s*CD-|페이지를 찾을 수 없습니다/i.test(text) || /error|404/i.test(title);
      }).catch(function() { return false; });

      if (isErrorPage) {
        console.log(`    [건너뜀-에러] ${btn.text}`);
        hrefCache.set(btn.href, 'SKIP');
        await landingPage.close();
        continue;
      }

      const w = isMobile ? 390 : 1280;
      await landingPage.setViewportSize({ width: w, height: 800 });
      const landingFilename = `landing_${brand}_${device}_${Date.now()}_${unique}.png`;
      const landingPath = path.join(screenshotDir, landingFilename);
      await landingPage.screenshot({ path: landingPath, clip: { x: 0, y: 0, width: w, height: 800 } });

      // 메인 배너 슬라이드(imgGallery)로 수집된 버튼이면 원본 슬라이드 이미지도 다운로드
      // (스크린샷은 캐러셀의 "현재 보이는 한 장"뿐이라 나머지 슬라이드 실제 배너 이미지는
      //  ADFE 데이터에 있던 원본 이미지 URL을 직접 받아와야 함)
      let slideImagePath = null;
      if (btn.slideImageUrl) {
        try {
          const imgResp = await context.request.get(btn.slideImageUrl, { timeout: 10000 });
          if (imgResp.ok()) {
            const ext = (btn.slideImageUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) || [,'jpg'])[1].toLowerCase();
            const slideFilename = `slide_${brand}_${device}_${btn.slideIndex}_${Date.now()}_${unique}.${ext}`;
            const slideFullPath = path.join(screenshotDir, slideFilename);
            fs.writeFileSync(slideFullPath, await imgResp.body());
            slideImagePath = 'screenshots/' + slideFilename;
          }
        } catch (e) {
          console.log(`    [슬라이드 이미지 다운로드 실패] ${btn.text}: ${e.message}`);
        }
      }

      const cached = {
        finalUrl: finalUrlCheck,
        landingScreenshot: 'screenshots/' + landingFilename,
        slideImage: slideImagePath,
      };
      hrefCache.set(btn.href, cached);
      landingData.push(buildLandingEntry(btn, cached));

      await landingPage.close();
      await new Promise(function(r) { setTimeout(r, 800); });
    } catch (e) {
      console.log(`    [실패] ${btn.text}: ${e.message}`);
      hrefCache.set(btn.href, 'SKIP');
    }
  }
  return landingData;
}

function buildResult(brand, device, screenshotFilename, landingData) {
  return {
    id: `naver_bs_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    platform: 'naver_bs',
    device,
    advertiserName: brand,
    keyword: brand,
    searchType: 'brand',
    mediaType: 'image',
    mediaUrl: '',
    localPath: 'screenshots/' + screenshotFilename,
    screenshotPath: 'screenshots/' + screenshotFilename,
    buttons: landingData,
    copyText: '',
    landingUrl: landingData[0]?.finalUrl || '',
    collectedAt: new Date().toISOString(),
  };
}

module.exports = { scrapeNaverBrandsearch };