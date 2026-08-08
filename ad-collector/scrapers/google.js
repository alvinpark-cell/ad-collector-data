/**
 * Google 광고 투명성 센터 스크래퍼
 * - 카드 클릭 → 상세 패널 열기 → 실제 랜딩 URL, 디스크립션 추출
 * - YouTube 영상 mediaUrl 생성
 */

const { chromium } = require('playwright');
const path = require('path');
const { loadIndex } = require('../utils');
const { normalizeUrl } = require('../processItems');

// 브랜드명으로 검색 -> "더보기"/엔터 -> 화면에 노출된 광고주 후보명(클릭 가능한 텍스트) 목록을
// 반환한다. 한 브랜드가 구글에 여러 광고주 계정으로 나뉘어 있는 경우(투명성센터 자체가
// "여러 광고주 계정에서 비슷한 이름을 사용하고 있습니다" 경고를 띄움 - 미래에셋증권 실측:
// "미래에셋증권 주식회사"/"미래에셋증권" 두 계정, 삼성증권도 유사)가 있어서, 후보 중 하나만
// 훑으면 절반 가까이 누락된다. 그래서 후보 감지와 각 후보 방문을 분리하고, 후보 하나를 다 보고
// 나면 이 함수를 다시 호출해 페이지를 처음부터 새로 검색 상태로 되돌린 뒤 다음 후보를 찾는다
// (이전엔 클릭 후 page.goBack()으로 되돌리려 했는데, 새 탭이 안 열리고 같은 탭에서 그대로
// 이동해버리면 goBack이 검색 결과가 아니라 그냥 기본 홈으로 가버려서 두 번째 후보부터는
// 조용히 스킵되고 있었음 - 로그 한 줄도 안 남아서 그동안 못 알아챈 버그).
async function searchBrandAndGetCandidates(page, brand) {
  // 'networkidle'은 이 사이트에서 신뢰할 수 없음(실측: 어떤 배경 요청이 계속 떠 있는지
  // 완전히 idle 상태로 안 잡혀서 40초 타임아웃이 나는 경우가 있었음, 같은 URL을
  // 'domcontentloaded'로는 1초 안에 안정적으로 성공). 이후 waitForTimeout으로 렌더링을
  // 기다리므로 networkidle 없이도 안전하다.
  await page.goto('https://adstransparency.google.com/?region=KR', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  const searchInput = page.locator('search-input input, input.mat-input-element').first();
  if (await searchInput.count() === 0) return [];

  await searchInput.click();
  await page.waitForTimeout(300);
  await searchInput.pressSequentially(brand, { delay: 100 });
  await page.waitForTimeout(2000);

  const moreBtn = page.locator('.search-improvements-footer material-button, .search-improvements-footer button, material-button.see-more-button').first();
  if (await moreBtn.count() > 0) {
    await moreBtn.click();
  } else {
    await searchInput.press('Enter');
  }
  await page.waitForTimeout(4000);

  return page.evaluate(function(bShort) {
    var names = [];
    var seen = new Set();
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      var el = walker.currentNode;
      var text = (el.innerText || '').trim().split('\n')[0].trim();
      if (text.length < 2 || text.length > 30) continue;
      if (!text.includes(bShort)) continue;
      if (seen.has(text)) continue;
      var style = window.getComputedStyle(el);
      var isClickable = el.tagName === 'A' || el.tagName === 'BUTTON' ||
        style.cursor === 'pointer' || el.getAttribute('role') === 'button' ||
        el.getAttribute('tabindex') !== null;
      if (isClickable) { seen.add(text); names.push(text); }
    }
    return names.slice(0, 5);
  }, brand.slice(0, 3));
}

// onBrandDone(brand, brandItems): 브랜드 하나가 끝날 때마다 호출됨(성공/부분실패 모두).
// 브랜드가 9개나 되고 광고주당 수백 건씩 상세 방문하다 보니 전체가 몇 시간씩 걸릴 수 있는데,
// 예전엔 9개를 다 돌아야 결과를 반환해서 중간에 죽으면 그때까지 처리한 것도 전부 날아갔음.
// 호출 쪽(collector.js)이 이 콜백에서 바로 저장하면, 끊겨도 그 지점까지는 안전하게 남는다.
async function scrapeGoogle(keywords, brands, settings, onBrandDone) {
  const results = [];
  if (!brands || brands.length === 0) return results;

  // 상세페이지 방문(마지막 게재일 확인)이 매주 소요시간의 대부분을 차지하는데, 중복 판정 자체는
  // 카드 목록 파싱 단계에서 얻는 이미지/영상 URL만으로 processItems.js와 동일하게 이미 끝난다.
  // 그래서 이미 저장돼있는 카드는 상세페이지를 다시 안 들어가고 건너뛴다 - 정확도에는 영향 없고
  // (기존 저장 항목은 그대로 유지됨), 매주 새로 나타난 카드 수만큼만 시간이 든다.
  const existingIndex = settings && settings.dataDir ? loadIndex(path.join(settings.dataDir, 'index.json')) : [];
  const existingMediaUrls = new Set(existingIndex.map(i => normalizeUrl(i.mediaUrl || i.thumbnailUrl)).filter(Boolean));

  const browser = await chromium.launch({ headless: true });

  for (const brand of brands) {
    console.log(`[Google] "${brand}" 검색 중...`);
    const resultsLenBefore = results.length;
    try {
      const contextOptions = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'ko-KR',
        viewport: { width: 1280, height: 900 },
      };

      // 광고주 후보 목록 확인은 가벼운 임시 컨텍스트로 한 번만 수행
      const probeContext = await browser.newContext(contextOptions);
      const probePage = await probeContext.newPage();
      const advertiserNames = await searchBrandAndGetCandidates(probePage, brand);
      await probeContext.close();

      if (advertiserNames.length === 0) {
        console.log(`[Google] "${brand}" 검색창 없음 또는 광고주 없음`);
        continue;
      }
      console.log(`[Google] "${brand}" 광고주 후보: ${advertiserNames.join(', ')}`);

      for (const advertiserName of advertiserNames) {
        // 후보 하나당 완전히 새 컨텍스트(쿠키/세션 전부 새로)를 쓴다 - 실측 확인: 한 후보를
        // 처리하며 상세페이지를 수백 개 방문한 뒤 같은 세션에서 재검색하면 구글이 검색
        // 제안 자체를 빈 목록으로 응답하는 현상이 있었다(미래에셋증권 두 번째 계정이 매번
        // 이렇게 조용히 실패). 세션을 완전히 새로 시작하면 이 상태가 리셋되는지 확인하기
        // 위한 조치.
        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        try {
          await searchBrandAndGetCandidates(page, brand);

          const targetEl = page.locator('text="' + advertiserName + '"').first();
          // 후보명이 여러 개일 때 재검색이 첫 번째보다 느리게 렌더링되는 경우가 실측으로
          // 확인됨(고정 대기 4초로는 부족) - count()로 바로 판정하지 않고 최대 8초까지
          // 실제로 나타나길 기다린 다음에만 "못 찾음"으로 최종 판정한다.
          await targetEl.waitFor({ state: 'visible', timeout: 8000 }).catch(function() {});
          if (await targetEl.count() === 0) {
            console.log(`[Google] "${advertiserName}" 재검색 후 못 찾음, 건너뜀`);
            continue;
          }

          const ytIds = new Set();
          page.on('response', async function(response) {
            try {
              const text = await response.text().catch(function() { return ''; });
              const matches = [...text.matchAll(/ytimg\.com\/vi\/([\w\-]{11})\//g)];
              matches.forEach(function(m) { ytIds.add(m[1]); });
            } catch (_) {}
          });

          await targetEl.click();
          await page.waitForTimeout(3000);

          if (!page.url().includes('/advertiser/AR')) {
            console.log(`[Google] "${advertiserName}" URL 변화 없음, 건너뜀`);
            continue;
          }
          const targetPage = page;
          console.log(`[Google] "${advertiserName}" 페이지 이동: ${targetPage.url()}`);

          await targetPage.waitForTimeout(3000);
          // 무한 스크롤 - 삼성증권처럼 광고가 2,000건 넘는 광고주는 예전 고정 상한(30회)으로는
          // 끝까지 못 불러오고 잘리는 문제가 있었다(2026-08-05 확인). 상한 자체를 크게 늘리고
          // (500회 - 사실상 안전장치일 뿐 정상적으로는 그 전에 다 불러와짐), "높이가 한 번
          // 안 늘어남 = 끝"이라고 바로 단정하지도 않는다 - 네트워크 지연으로 그 순간만 못
          // 늘어난 걸 끝난 걸로 착각해서 일찍 멈추는 걸 막기 위해 3번 연속 안 늘어나야만
          // 진짜 끝난 것으로 본다.
          let lastHeight = 0;
          let stallCount = 0;
          for (let i = 0; i < 500; i++) {
            await targetPage.evaluate(function() { window.scrollTo(0, document.body.scrollHeight); });
            await targetPage.waitForTimeout(1800);
            const height = await targetPage.evaluate(function() { return document.body.scrollHeight; });
            if (height === lastHeight) {
              stallCount++;
              if (stallCount >= 3) break;
            } else {
              stallCount = 0;
              lastHeight = height;
            }
          }

          // 상한 없이 로드된 카드 전부 조회 (예전엔 광고주당 30개로 제한했었는데,
          // 실제로는 광고주당 광고 수가 그보다 적은 경우가 많아서 상한 자체가 무의미했고,
          // 오히려 진짜 30개 넘게 있는 광고주는 일부가 누락되고 있었음)
          const cardCount = await targetPage.locator('creative-preview, [class*="creative-preview"]').count();
          const maxCards = cardCount;
          console.log(`[Google] "${advertiserName}" 카드 ${cardCount}개 전체 상세 조회`);

          // 카드 전체를 DOM에서 한 번에 파싱 (카드별 클릭 방식 → 타임아웃 문제 해결)
          const cards = await targetPage.evaluate(function(args) {
            var maxN = args.maxN, advName = args.advName, pageUrl = args.pageUrl;
            var cardEls = Array.from(document.querySelectorAll('creative-preview, [class*="creative-preview"]')).slice(0, maxN);
            var results = [];

            cardEls.forEach(function(card) {
              try {
                // 썸네일
                var img = card.querySelector('img:not([src*="icon"]):not([src*="logo"]):not([src*="avatar"])');
                var src = img ? (img.src || img.currentSrc || '') : '';
                if (!src) return;
                if (img.naturalWidth > 0 && img.naturalWidth < 50) return;

                var isYt = src.includes('ytimg.com');
                var mediaUrl = src;
                if (isYt) {
                  var m = src.match(/\/vi\/([\w\-]{11})\//);
                  mediaUrl = m ? ('https://www.youtube.com/watch?v=' + m[1]) : src;
                }

                // 게재일: 목록 화면에는 날짜 정보가 전혀 없음(실측 확인됨) - 상세페이지 방문으로
                // 별도 확보한다 (아래, cards 배열 완성 후). 여기선 상세페이지 링크만 잡아둔다.
                var detailsA = card.querySelector('a[href*="/creative/"]');
                var detailsLink = detailsA ? detailsA.href : '';
                var adLastShownAt = null;
                var adStartedAt = null;

                // 랜딩 URL
                var landingUrl = '';
                var links = card.querySelectorAll('a[href]');
                for (var k = 0; k < links.length; k++) {
                  var href = links[k].href || '';
                  if (href && !href.includes('adstransparency.google.com') &&
                      !href.includes('google.com/search') && !href.includes('support.google') &&
                      (href.startsWith('http://') || href.startsWith('https://'))) {
                    landingUrl = href;
                    break;
                  }
                }

                // 광고주 링크 (투명성 센터 URL → sourceUrl)
                var sourceUrl = pageUrl;
                var advLink = card.querySelector('a[href*="adstransparency.google.com/advertiser"]');
                if (advLink) sourceUrl = advLink.href;

                // 복사 텍스트 - 일부 광고주(실측: "미래에셋증권 주식회사") 카드는 광고주명
                // 라벨이 길이 조건(10~400자)을 충족해서 실제 카피보다 먼저 걸려버린다. 그러면
                // "문구 있음"으로 오인돼 디스크립션 백필도 건너뛰고, 화면에는 광고주명만 문구로
                // 보이는 문제가 생긴다(2026-08-09 확인) - 광고주명과 같은 텍스트는 후보에서 제외.
                var copyText = '';
                var advNameNorm = advName.replace(/\s/g, '');
                var textEls = card.querySelectorAll('p, span, div');
                for (var j = 0; j < textEls.length; j++) {
                  var t = (textEls[j].innerText || '').trim();
                  if (t.length > 10 && t.length < 400 && !t.includes('http') && !t.includes('google.com') &&
                      t.replace(/\s/g, '') !== advNameNorm) {
                    copyText = t;
                    break;
                  }
                }

                results.push({
                  mediaType: isYt ? 'video' : 'image',
                  mediaUrl: mediaUrl,
                  thumbnailUrl: src,
                  advertiserName: advName,
                  copyText: copyText,
                  headline: '',
                  // 카드 목록에는 실제 광고주 랜딩 URL이 노출되지 않는 경우가 대부분이라
                  // (실측상 항상 0건) 못 찾으면 투명성 센터 상세페이지 URL로 대체
                  landingUrl: landingUrl || detailsLink,
                  sourceUrl: sourceUrl,
                  platform: 'google',
                  detailsLink: detailsLink,
                  adStartedAt: adStartedAt,
                  adLastShownAt: adLastShownAt,
                  status: 'active',
                });
              } catch (_) {}
            });

            return results;
          }, { maxN: maxCards, advName: advertiserName, pageUrl: targetPage.url() });

          // YT 인터셉트로 놓친 영상 보완
          const domThumbUrls = new Set(cards.map(c => c.thumbnailUrl).filter(Boolean));
          ytIds.forEach(function(ytId) {
            const thumbUrl = 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg';
            if (!domThumbUrls.has(thumbUrl)) {
              cards.push({
                mediaType: 'video',
                mediaUrl: 'https://www.youtube.com/watch?v=' + ytId,
                thumbnailUrl: thumbUrl,
                advertiserName: advertiserName,
                copyText: '', headline: '', landingUrl: '',
                sourceUrl: targetPage.url(),
                platform: 'google',
                adStartedAt: null, adLastShownAt: null,
              });
            }
          });

          // 각 카드의 상세페이지를 방문해서 정확한 "마지막 게재일"을 확보한다.
          // 목록 화면에는 날짜 정보가 전혀 없고 상세페이지(.property.last-shown)에만 있음이
          // 실측으로 확인됨.
          // (주의: 이 날짜로 status를 임의 판정하지 않는다 - 종료 여부는 tracker.js가
          //  "이번 수집에 다시 나타났는지"로만 판단하는 게 맞고, 마지막 게재일은 그냥
          //  정확한 메타데이터로만 저장한다.)
          // (2026-08-06 추가: 이미 저장된 카드(이미지/영상 URL이 index.json에 이미 있음)는
          //  상세페이지를 다시 안 들어간다 - 어차피 processAndSaveItems에서 중복으로 걸러져
          //  저장 안 되고, 게재일도 기존 값 그대로 유지되므로 재방문할 이유가 없다. 신규 카드만
          //  방문해서 매주 소요시간이 "전체 카드 수"가 아니라 "신규 카드 수"에 비례하게 한다.)
          let skippedDetailVisits = 0;
          for (const c of cards) {
            if (!c.detailsLink) continue;
            const urlKey = normalizeUrl(c.mediaUrl || c.thumbnailUrl);
            if (urlKey && existingMediaUrls.has(urlKey)) { skippedDetailVisits++; continue; }
            try {
              await targetPage.goto(c.detailsLink, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await targetPage.waitForSelector('.last-shown, [class*="last-shown"]', { timeout: 5000 }).catch(function() {});
              const lastShownText = await targetPage.evaluate(function() {
                var el = document.querySelector('.last-shown, [class*="last-shown"]');
                return el ? (el.innerText || '') : '';
              });
              const match = lastShownText.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
              if (match) {
                c.adLastShownAt = match[1] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[3]).padStart(2, '0');
              }
              await targetPage.waitForTimeout(500);
            } catch (e) {
              console.log(`    [상세페이지 방문 실패] ${advertiserName}: ${e.message}`);
            }
          }

          const tagged = cards.map(function(c) {
            return Object.assign({}, c, {
              keyword: brand,
              searchType: 'brand',
              id: 'google_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
              collectedAt: new Date().toISOString(),
            });
          });

          results.push(...tagged);
          console.log(`[Google] "${advertiserName}" → ${tagged.length}개 (랜딩URL 확보: ${tagged.filter(t=>t.landingUrl).length}개, 기존 저장분이라 상세페이지 재방문 건너뜀: ${skippedDetailVisits}개)`);

          await new Promise(function(r) { setTimeout(r, 1500); });
        } catch (e) {
          console.error(`[Google] "${advertiserName}" 오류:`, e.message);
        } finally {
          await context.close();
        }
      }

      await new Promise(function(r) { setTimeout(r, 2000); });
    } catch (err) {
      console.error(`[Google] "${brand}" 전체 오류:`, err.message);
    }

    if (onBrandDone) {
      const brandItems = results.slice(resultsLenBefore);
      try {
        await onBrandDone(brand, brandItems);
      } catch (e) {
        console.error(`[Google] "${brand}" 중간 저장 콜백 오류:`, e.message);
      }
    }
  }

  await browser.close();
  return results;
}

module.exports = { scrapeGoogle };
