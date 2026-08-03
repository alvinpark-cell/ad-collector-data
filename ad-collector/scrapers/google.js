/**
 * Google 광고 투명성 센터 스크래퍼
 * - 카드 클릭 → 상세 패널 열기 → 실제 랜딩 URL, 디스크립션 추출
 * - YouTube 영상 mediaUrl 생성
 */

const { chromium } = require('playwright');

async function scrapeGoogle(keywords, brands, settings) {
  const results = [];
  if (!brands || brands.length === 0) return results;

  const browser = await chromium.launch({ headless: true });

  for (const brand of brands) {
    console.log(`[Google] "${brand}" 검색 중...`);
    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'ko-KR',
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();

      await page.goto('https://adstransparency.google.com/?region=KR', {
        waitUntil: 'networkidle', timeout: 40000,
      });
      await page.waitForTimeout(2000);

      const searchInput = page.locator('search-input input, input.mat-input-element').first();
      if (await searchInput.count() === 0) {
        console.log(`[Google] "${brand}" 검색창 없음`);
        await context.close();
        continue;
      }

      await searchInput.click();
      await page.waitForTimeout(300);
      await searchInput.pressSequentially(brand, { delay: 100 });
      await page.waitForTimeout(2000);

      const moreBtn = page.locator('.search-improvements-footer material-button, .search-improvements-footer button, material-button.see-more-button').first();
      if (await moreBtn.count() > 0) {
        await moreBtn.click();
        console.log(`[Google] "${brand}" 검색 결과 더보기 클릭`);
      } else {
        await searchInput.press('Enter');
      }
      await page.waitForTimeout(4000);

      const advertiserNames = await page.evaluate(function(bShort) {
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

      console.log(`[Google] "${brand}" 광고주 후보: ${advertiserNames.join(', ')}`);
      if (advertiserNames.length === 0) {
        console.log(`[Google] "${brand}" 광고주 없음`);
        await context.close();
        continue;
      }

      for (const advertiserName of advertiserNames) {
        try {
          const adPage = await context.newPage();
          const ytIds = new Set();

          adPage.on('response', async function(response) {
            try {
              const text = await response.text().catch(function() { return ''; });
              const matches = [...text.matchAll(/ytimg\.com\/vi\/([\w\-]{11})\//g)];
              matches.forEach(function(m) { ytIds.add(m[1]); });
            } catch (_) {}
          });

          const targetEl = page.locator('text="' + advertiserName + '"').first();
          if (await targetEl.count() === 0) { await adPage.close(); continue; }

          const beforeUrl = page.url();
          await targetEl.click({ modifiers: ['Meta'] }).catch(async function() { await targetEl.click(); });
          await page.waitForTimeout(3000);

          const afterUrl = page.url();
          let targetPage = page;

          if (afterUrl.includes('/advertiser/AR')) {
            targetPage = page;
            console.log(`[Google] "${advertiserName}" 페이지 이동: ${afterUrl}`);
          } else {
            const pages = context.pages();
            const newPage = pages.find(function(p) { return p !== page && p !== adPage; });
            if (newPage && newPage.url().includes('/advertiser/')) {
              targetPage = newPage;
            } else {
              console.log(`[Google] "${advertiserName}" URL 변화 없음, 건너뜀`);
              await adPage.close();
              if (page.url() !== beforeUrl) {
                await page.goto('https://adstransparency.google.com/?region=KR', { waitUntil: 'networkidle', timeout: 20000 });
                await page.waitForTimeout(1000);
              }
              continue;
            }
          }

          await targetPage.waitForTimeout(3000);
          for (let i = 0; i < 5; i++) {
            await targetPage.evaluate(function() { window.scrollTo(0, document.body.scrollHeight); });
            await targetPage.waitForTimeout(1800);
          }

          // 카드 목록 가져오기 (최대 30개 - 더 많이 수집)
          const cardCount = await targetPage.locator('creative-preview, [class*="creative-preview"]').count();
          const maxCards = Math.min(cardCount, 30);
          console.log(`[Google] "${advertiserName}" 카드 ${cardCount}개 중 ${maxCards}개 상세 조회`);

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

                // 복사 텍스트
                var copyText = '';
                var textEls = card.querySelectorAll('p, span, div');
                for (var j = 0; j < textEls.length; j++) {
                  var t = (textEls[j].innerText || '').trim();
                  if (t.length > 10 && t.length < 400 && !t.includes('http') && !t.includes('google.com')) {
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
          // 실측으로 확인됨. 월 1회만 도는 배치라 카드당 1번씩 방문해도 시간 부담이 없다.
          // (주의: 이 날짜로 status를 임의 판정하지 않는다 - 종료 여부는 tracker.js가
          //  "이번 수집에 다시 나타났는지"로만 판단하는 게 맞고, 마지막 게재일은 그냥
          //  정확한 메타데이터로만 저장한다.)
          for (const c of cards) {
            if (!c.detailsLink) continue;
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
          console.log(`[Google] "${advertiserName}" → ${tagged.length}개 (랜딩URL 확보: ${tagged.filter(t=>t.landingUrl).length}개)`);

          if (targetPage !== page) await targetPage.close();
          await adPage.close();

          if (!page.url().includes('region=KR')) {
            await page.goBack().catch(async function() {
              await page.goto('https://adstransparency.google.com/?region=KR', { waitUntil: 'networkidle', timeout: 20000 });
            });
            await page.waitForTimeout(2000);
          }

          await new Promise(function(r) { setTimeout(r, 1500); });
        } catch (e) {
          console.error(`[Google] "${advertiserName}" 오류:`, e.message);
        }
      }

      await context.close();
      await new Promise(function(r) { setTimeout(r, 2000); });
    } catch (err) {
      console.error(`[Google] "${brand}" 전체 오류:`, err.message);
    }
  }

  await browser.close();
  return results;
}

module.exports = { scrapeGoogle };
