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

                // 게재일: 카드 텍스트에서 날짜 패턴 추출
                var cardText = card.innerText || '';

                // "마지막 게재일: 2026년 6월 28일" 패턴
                var lastShownMatch = cardText.match(/마지막\s*게재일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
                var adLastShownAt = null;
                if (lastShownMatch) {
                  adLastShownAt = lastShownMatch[1] + '-' + String(lastShownMatch[2]).padStart(2,'0') + '-' + String(lastShownMatch[3]).padStart(2,'0');
                }

                // "게재 시작: 2026년 N월 N일" 또는 점 구분 날짜 패턴
                var startMatch = cardText.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
                var adStartedAt = null;
                if (startMatch && !lastShownMatch) {
                  adStartedAt = startMatch[1] + '-' + String(startMatch[2]).padStart(2,'0') + '-' + String(startMatch[3]).padStart(2,'0');
                }
                // fallback: 점 구분 날짜
                if (!adStartedAt && !adLastShownAt) {
                  var dotDates = cardText.match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/g) || [];
                  if (dotDates[0]) adStartedAt = dotDates[0].replace(/\./g,'-').replace(/--/g,'-');
                  if (dotDates[1]) adLastShownAt = dotDates[1].replace(/\./g,'-').replace(/--/g,'-');
                }

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
                  landingUrl: landingUrl,
                  sourceUrl: sourceUrl,
                  platform: 'google',
                  adStartedAt: adStartedAt,
                  adLastShownAt: adLastShownAt,
                  status: adLastShownAt ? 'ended' : 'active',
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
