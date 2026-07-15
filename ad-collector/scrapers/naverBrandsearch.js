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
  const detection = await page.evaluate(function() {
    // 브검 컨테이너: api_subject_bx 안에 브검 블록이 있어야 함
    var bx = document.querySelector('.api_subject_bx, section.sp_brand');
    if (!bx) return { found: false };

    // 브검 여부 판단: __ADFE_TEMPLATE_BLOCK__ 존재 or 알려진 id 패턴
    var hasAdfe = typeof window.__ADFE_TEMPLATE_BLOCK__ === 'object' &&
                  Object.keys(window.__ADFE_TEMPLATE_BLOCK__).length > 0;
    var hasKnownId = !!(
      bx.querySelector('[id^="premiumvideo_"]') ||
      bx.querySelector('[id^="premiumstory_"]') ||
      bx.querySelector('[id^="directlink_"]') ||
      bx.querySelector('[id^="brandnews_"]') ||
      bx.querySelector('[id^="bottomscroll_"]') ||
      bx.querySelector('[id^="bottomtriplelarge"]') ||
      bx.querySelector('[id^="light_"]')
    );

    if (!hasAdfe && !hasKnownId) return { found: false };

    var rect = bx.getBoundingClientRect();
    return {
      found: true,
      hasAdfe: hasAdfe,
      box: { x: rect.x, y: rect.top, width: rect.width, height: rect.height },
    };
  });

  if (!detection.found) {
    console.log(`  [${device.toUpperCase()}] 브랜드검색 없음`);
    await context.close();
    return null;
  }

  // ── 2단계: 스크린샷 영역을 콘텐츠 전체 높이로 재측정 ─────────────────────
  const fullBox = await page.evaluate(function() {
    var bx = document.querySelector('.api_subject_bx, section.sp_brand');
    if (!bx) return null;
    var rect = bx.getBoundingClientRect();
    // 하위 모든 요소의 실제 하단 경계를 측정
    var bottom = rect.bottom;
    bx.querySelectorAll('*').forEach(function(el) {
      var r = el.getBoundingClientRect();
      if (r.bottom > bottom && r.width > 10) bottom = r.bottom;
    });
    return { x: rect.x, y: rect.top, width: rect.width, height: bottom - rect.top };
  });

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
  const buttons = await page.evaluate(function() {
    var results = [];
    var seen = new Set();

    function addButton(text, href) {
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
      // 중복/전화/빈값 제외
      if (!finalUrl || seen.has(finalUrl)) return;
      if (finalUrl.startsWith('tel:')) { seen.add(finalUrl); results.push({ text: text.trim().slice(0,40), href: finalUrl }); return; }
      if (!finalUrl.startsWith('http')) return;
      seen.add(finalUrl);
      results.push({ text: text.trim().slice(0,40), href: finalUrl });
    }

    var adfe = window.__ADFE_TEMPLATE_BLOCK__;
    if (adfe && typeof adfe === 'object') {
      Object.keys(adfe).forEach(function(blockKey) {
        var blockArr = adfe[blockKey];
        if (!Array.isArray(blockArr)) return;

        blockArr.forEach(function(entry) {
          if (!Array.isArray(entry) || entry.length < 2) return;
          var data = entry[1]; // 두 번째 요소가 실제 데이터
          if (!data || typeof data !== 'object') return;

          // ── directLink: 홈페이지 링크 ──
          if (data.link && data.logoText) {
            addButton(data.logoText + ' 홈페이지', data.link);
          }

          // ── brandNews: 이벤트/새소식 링크 ──
          if (data.title && data.link) {
            addButton(data.title, data.link);
          }

          // ── premiumStory (플리킹 캐러셀): imgGallery 배열 ──
          if (Array.isArray(data.imgGallery)) {
            data.imgGallery.forEach(function(item) {
              var btnText = item.btnText || (item.content && item.content.content2 && item.content.content2.title ? item.content.content2.title.join(' ') : '');
              if (item.link) addButton(btnText || '메인이미지', item.link);
            });
          }

          // ── bottomScroll (아이콘 버튼 리스트) ──
          if (Array.isArray(data.items)) {
            data.items.forEach(function(item) {
              if (item.text && item.link) addButton(item.text, item.link);
            });
          }

          // ── bottomTripleLargeTab (탭 구조) ──
          if (Array.isArray(data.tabs)) {
            data.tabs.forEach(function(tab) {
              if (Array.isArray(tab.items)) {
                tab.items.forEach(function(item) {
                  if (item.text && item.link) addButton(item.text, item.link);
                });
              }
            });
          }

          // ── bottomTripleLarge (탭 없는 3열) ──
          if (Array.isArray(data.single)) {
            data.single.forEach(function(item) {
              if (item.text && item.link) addButton(item.text, item.link);
            });
          }

          // ── light_ (썸네일형): imgLink + link ──
          if (data.imgLink) addButton(data.subtitle || data.title || '메인이미지', data.imgLink);
          if (data.link && data.title && !data.imgGallery) addButton(data.title, data.link);

          // ── _blocks.next 안의 데이터도 재귀적으로 처리 ──
          // (네이버는 블록 체인 구조로 next에 다음 블록 데이터를 포함)
          if (data._blocks && data._blocks.next && data._blocks.next.data) {
            var nextData = data._blocks.next.data;
            // premiumStory
            if (Array.isArray(nextData.imgGallery)) {
              nextData.imgGallery.forEach(function(item) {
                var btnText = item.btnText || '';
                if (item.link) addButton(btnText || '메인이미지', item.link);
              });
            }
            // bottomScroll
            if (Array.isArray(nextData.items)) {
              nextData.items.forEach(function(item) {
                if (item.text && item.link) addButton(item.text, item.link);
              });
            }
            // bottomTripleLargeTab
            if (Array.isArray(nextData.tabs)) {
              nextData.tabs.forEach(function(tab) {
                if (Array.isArray(tab.items)) {
                  tab.items.forEach(function(item) {
                    if (item.text && item.link) addButton(item.text, item.link);
                  });
                }
              });
            }
            // bottomTripleLarge single
            if (Array.isArray(nextData.single)) {
              nextData.single.forEach(function(item) {
                if (item.text && item.link) addButton(item.text, item.link);
              });
            }
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
          if (!seen.has(finalUrl)) {
            seen.add(finalUrl);
            results.push({ text: text, href: finalUrl });
          }
        });
      }
    }

    return results.slice(0, 15);
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

// 랜딩 페이지 캡처 (네이버 리다이렉트 처리 + 에러페이지 필터 + 중복 제거)
async function captureLandings(context, buttons, brand, device, screenshotDir, isMobile) {
  const landingData = [];
  const seenFinalUrls = new Set();
  const unique = Math.random().toString(36).slice(2,6);

  for (const btn of buttons.slice(0, 8)) {
    if (!btn.href) continue;
    try {
      const landingPage = await context.newPage();
      await landingPage.goto(btn.href, { waitUntil: 'networkidle', timeout: 20000 });
      await landingPage.waitForTimeout(1800);
      const finalUrlCheck = landingPage.url();

      // 네이버 자체 페이지(로그인, 개발자문서 등)로 빠지면 스킵
      if (finalUrlCheck.includes('nid.naver.com') || finalUrlCheck.includes('developers.naver.com') ||
          finalUrlCheck.includes('help.naver.com')) {
        console.log(`    [건너뜀-네이버내부] ${btn.text}`);
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
        await landingPage.close();
        continue;
      }

      // 동일 최종 URL 중복 제거
      if (seenFinalUrls.has(finalUrlCheck)) {
        await landingPage.close();
        continue;
      }
      seenFinalUrls.add(finalUrlCheck);

      const w = isMobile ? 390 : 1280;
      await landingPage.setViewportSize({ width: w, height: 800 });
      const landingFilename = `landing_${brand}_${device}_${Date.now()}_${unique}.png`;
      const landingPath = path.join(screenshotDir, landingFilename);
      await landingPage.screenshot({ path: landingPath, clip: { x: 0, y: 0, width: w, height: 800 } });

      landingData.push({
        buttonText: btn.text,
        buttonUrl: btn.href,
        finalUrl: finalUrlCheck,
        landingScreenshot: 'screenshots/' + landingFilename,
      });
      await landingPage.close();
      await new Promise(function(r) { setTimeout(r, 800); });
    } catch (e) {
      console.log(`    [실패] ${btn.text}: ${e.message}`);
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