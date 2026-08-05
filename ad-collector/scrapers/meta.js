/**
 * Meta 광고 라이브러리 스크래퍼
 * - 이미지 + 영상 수집
 * - 디스크립션, 랜딩 URL 수집
 */

const { chromium } = require('playwright');

async function scrapeMeta(keywords, brands, settings) {
  const results = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
  });

  const allSearchTerms = [
    ...keywords.map(k => ({ term: k, type: 'keyword' })),
    ...brands.map(b => ({ term: b, type: 'brand' })),
  ];

  for (const { term, type } of allSearchTerms) {
    console.log(`[Meta] 검색 중: "${term}" (${type})`);
    try {
      const page = await context.newPage();

      // 네트워크 인터셉트: fbcdn 미디어 캡처
      const capturedMedia = [];
      const seenUrls = new Set();
      page.on('response', async (response) => {
        try {
          const url = response.url();
          const ct = response.headers()['content-type'] || '';
          if (seenUrls.has(url)) return;
          if (url.includes('fbcdn.net') && ct.startsWith('image/') &&
              !url.includes('profile') && !url.includes('avatar') && !url.includes('emoji')) {
            seenUrls.add(url);
            capturedMedia.push({ mediaType: 'image', mediaUrl: url });
          }
          if (url.includes('fbcdn.net') && (ct.startsWith('video/') || url.includes('.mp4'))) {
            seenUrls.add(url);
            capturedMedia.push({ mediaType: 'video', mediaUrl: url });
          }
        } catch (_) {}
      });

      const searchUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=KR&q=${encodeURIComponent(term)}&search_type=keyword_unordered&media_type=all`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(3000);

      // 쿠키 닫기
      try {
        for (const sel of ['button[title="모두 허용"]', 'button:has-text("모두 허용")', '[data-cookiebanner="accept_button"]']) {
          const btn = page.locator(sel);
          if (await btn.count() > 0) { await btn.first().click(); break; }
        }
        await page.waitForTimeout(800);
      } catch (_) {}

      // 스크롤 - 10회로 강화 (더 많은 광고 로드)
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2500);
      }

      // DOM 파싱 - 광고 카드별로 디스크립션, 랜딩URL, 게재일, 광고ID 추출
      const cards = await page.evaluate(function() {
        var items = [];

        var cardEls = [];
        var selectors = ['._7jyg', '[data-testid="ad-archive-renderer"]', '._8n-1', '[role="article"]'];
        for (var s = 0; s < selectors.length; s++) {
          var found = document.querySelectorAll(selectors[s]);
          if (found.length > 0) { cardEls = Array.from(found); break; }
        }

        if (cardEls.length === 0) {
          var preWraps = document.querySelectorAll('div[style*="white-space: pre-wrap"], div[style*="white-space:pre-wrap"]');
          var seen = new Set();
          preWraps.forEach(function(pw) {
            var node = pw;
            for (var d = 0; d < 6; d++) {
              if (!node.parentElement) break;
              node = node.parentElement;
              if (node.querySelector('img') && !seen.has(node)) {
                seen.add(node);
                cardEls.push(node);
                break;
              }
            }
          });
        }

        cardEls.forEach(function(card) {
          try {
            // 광고주명 - "Learn More", "See Details" 같은 CTA 텍스트 방지
            var advertiserName = '';
            var ctaPattern = /^(learn more|see details|shop now|sign up|contact us|book now|apply now|get offer|watch more|download|install|subscribe|donate|get quote|see menu|send message|call now)$/i;
            var fbLinks = card.querySelectorAll('a[href*="facebook.com/"]');
            for (var fi = 0; fi < fbLinks.length; fi++) {
              var fbHref = fbLinks[fi].href || '';
              if (fbHref.includes('/ads/library') || fbHref.includes('/help') ||
                  fbHref.includes('/login') || fbHref.includes('/policies')) continue;
              var nameEl = fbLinks[fi].querySelector('strong, span') || fbLinks[fi];
              var candidate = nameEl.innerText.trim();
              if (candidate && candidate.length > 1 && candidate.length < 50 && !ctaPattern.test(candidate)) {
                advertiserName = candidate; break;
              }
            }
            if (!advertiserName) {
              var hEl = card.querySelector('h3, h4');
              if (hEl) advertiserName = hEl.innerText.trim();
            }

            // 광고 라이브러리 ID 추출 - 예전엔 innerHTML의 ad_archive_id 패턴이나
            // ads/library/?id= 링크를 찾았는데, 지금 페이스북 DOM엔 둘 다 전혀 없다(실측
            // 확인 - 2026-08-05). 대신 카드 화면에 그대로 보이는 "라이브러리 ID: 12345" 텍스트가
            // 안정적이라, 카드에서 위로 올라가며 그 텍스트가 정확히 1번만 나오는(=아직 이
            // 카드 하나로 스코프된) 가장 안쪽 조상에서 숫자를 뽑는다. 텍스트 문구가 바뀌는
            // 경우를 대비해 카드 자체에도 먼저 시도한다.
            var adId = '';
            (function() {
              var libMatch = card.innerText.match(/라이브러리 ID:\s*(\d+)/);
              if (libMatch) { adId = libMatch[1]; return; }
              var cur = card;
              for (var d = 0; d < 10; d++) {
                if (!cur.parentElement) break;
                cur = cur.parentElement;
                var count = (cur.innerText.match(/라이브러리 ID:/g) || []).length;
                if (count === 1) {
                  var m = cur.innerText.match(/라이브러리 ID:\s*(\d+)/);
                  if (m) adId = m[1];
                  break;
                }
                if (count > 1) break; // 이미 다른 광고까지 포함된 조상 - 더 못 감
              }
            })();

            // 게재 시작일 / 종료일 추출
            var adStartedAt = null, adLastShownAt = null, adStatus = 'active';
            var fullText = card.innerText || '';

            // 날짜 파싱 헬퍼 (2020~2030 범위 검증)
            function parseAdDate(y, mo, d) {
              var yi = parseInt(y), mi = parseInt(mo), di = parseInt(d);
              if (yi < 2020 || yi > 2030) return null;
              return yi + '-' + String(mi).padStart(2,'0') + '-' + String(di).padStart(2,'0');
            }
            var monthMap = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
              january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12};

            // 한국어 시작일: "2026. 6. 18.에 게재 시작함"
            var koStart = fullText.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*에?\s*게재\s*시작/);
            if (koStart) adStartedAt = parseAdDate(koStart[1], koStart[2], koStart[3]);

            // 영어 시작일: "Started running on Jun 18, 2026"
            if (!adStartedAt) {
              var enStart = fullText.match(/[Ss]tarted\s+running\s+on\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
              if (enStart) {
                var mn = monthMap[enStart[1].toLowerCase().slice(0,3)];
                if (mn) adStartedAt = parseAdDate(enStart[3], mn, enStart[2]);
              }
            }

            // 한국어 종료일: "2026. 7. 31.에 게재 중단"
            var koEnd = fullText.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*에?\s*게재\s*중단/);
            if (koEnd) {
              adLastShownAt = parseAdDate(koEnd[1], koEnd[2], koEnd[3]);
              adStatus = 'ended';
            }

            // 영어 종료일: "Ended on Jun 30, 2026"
            if (!adLastShownAt) {
              var enEnd = fullText.match(/[Ee]nded\s+on\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
              if (enEnd) {
                var mn2 = monthMap[enEnd[1].toLowerCase().slice(0,3)];
                if (mn2) { adLastShownAt = parseAdDate(enEnd[3], mn2, enEnd[2]); adStatus = 'ended'; }
              }
            }

            // 추가 종료 판단
            if (fullText.includes('게재 중단') || fullText.includes('Ended')) adStatus = 'ended';

            // 디스크립션
            var copyText = '';
            var preWrapEls = card.querySelectorAll('div[style*="white-space: pre-wrap"], div[style*="white-space:pre-wrap"]');
            for (var i = 0; i < preWrapEls.length; i++) {
              var t = (preWrapEls[i].innerText || '').trim();
              if (t.length > 5) { copyText = t.slice(0, 500); break; }
            }
            if (!copyText) {
              var copySelectors = ['[data-ad-preview="message"]', '[data-ad-comet-preview="message"]', 'div[dir="auto"]'];
              for (var i2 = 0; i2 < copySelectors.length; i2++) {
                var el = card.querySelector(copySelectors[i2]);
                if (el && el.innerText && el.innerText.trim().length > 5) {
                  copyText = el.innerText.trim().slice(0, 500);
                  break;
                }
              }
            }

            // 헤드라인
            var headlineEl = card.querySelector('._5r69, [class*="headline"], h2');
            var headline = headlineEl ? headlineEl.innerText.trim() : '';

            // 랜딩 URL
            var landingUrl = '';
            var allLinks = card.querySelectorAll('a[href]');
            for (var k = 0; k < allLinks.length; k++) {
              var href = allLinks[k].href;
              if (!href) continue;
              if (href.includes('facebook.com/ads/library')) continue;
              if (href.includes('facebook.com/help')) continue;
              if (href.startsWith('https://www.facebook.com/') && !href.includes('l.facebook.com')) continue;
              if (href.includes('l.facebook.com/l.php')) {
                try {
                  var u = new URL(href);
                  landingUrl = decodeURIComponent(u.searchParams.get('u') || href);
                } catch(_) { landingUrl = href; }
                break;
              }
              if (href.startsWith('http') && !href.includes('facebook.com')) {
                landingUrl = href;
                break;
              }
            }

            // 원본 링크 - 예전 셀렉터(ads/archive/, ad_id=, ads/library/?id=)에 맞는 링크가
            // 지금 DOM엔 없어서(실측 확인) adId를 직접 조립한다. adId 추출 자체가 위에서
            // "라이브러리 ID:" 텍스트 기반으로 이미 이 광고 하나로 정확히 스코프됐으므로 안전함.
            var sourceUrl = adId ? ('https://www.facebook.com/ads/library/?id=' + adId) : '';

            // 플레이스먼트 (Facebook/Instagram/Messenger 등 노출 매체)
            var placements = [];
            card.querySelectorAll('img[alt]').forEach(function(pimg) {
              var alt = (pimg.alt || '').toLowerCase();
              if (alt === 'facebook' || alt.includes('facebook')) placements.push('facebook');
              else if (alt === 'instagram' || alt.includes('instagram')) placements.push('instagram');
              else if (alt === 'messenger' || alt.includes('messenger')) placements.push('messenger');
              else if (alt.includes('audience network')) placements.push('audience_network');
            });
            if (placements.length === 0) {
              card.querySelectorAll('[aria-label]').forEach(function(el) {
                var label = (el.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('facebook') && !label.includes('library')) placements.push('facebook');
                else if (label.includes('instagram')) placements.push('instagram');
                else if (label.includes('messenger')) placements.push('messenger');
              });
            }
            var placementStr = Array.from(new Set(placements)).join(',');

            // 이미지
            card.querySelectorAll('img').forEach(function(img) {
              var src = img.src || img.dataset.src;
              if (!src || !src.includes('fbcdn')) return;
              if (src.includes('profile') || src.includes('avatar') || src.includes('emoji')) return;
              if (img.naturalWidth > 0 && img.naturalWidth < 100) return;
              items.push({
                mediaType: 'image',
                mediaUrl: src,
                advertiserName: advertiserName,
                copyText: copyText,
                headline: headline,
                landingUrl: landingUrl,
                sourceUrl: sourceUrl,
                adId: adId,
                adStartedAt: adStartedAt,
                adLastShownAt: adLastShownAt,
                status: adStatus,
                platform: 'meta',
                placements: placementStr,
              });
            });

            // 영상
            card.querySelectorAll('video').forEach(function(video) {
              var src = video.src || (video.querySelector('source') ? video.querySelector('source').src : '');
              var poster = video.poster || '';
              items.push({
                mediaType: 'video',
                mediaUrl: src || '',
                thumbnailUrl: poster,
                advertiserName: advertiserName,
                copyText: copyText,
                headline: headline,
                landingUrl: landingUrl,
                sourceUrl: sourceUrl,
                adId: adId,
                adStartedAt: adStartedAt,
                adLastShownAt: adLastShownAt,
                status: adStatus,
                platform: 'meta',
                placements: placementStr,
              });
            });
          } catch (_) {}
        });

        return items;
      });

      // 네트워크 인터셉트 미디어 보완
      const domUrls = new Set(cards.map(function(c) { return c.mediaUrl; }).filter(Boolean));
      capturedMedia.forEach(function(m) {
        if (!domUrls.has(m.mediaUrl)) {
          cards.push({
            mediaType: m.mediaType,
            mediaUrl: m.mediaUrl,
            advertiserName: type === 'brand' ? term : '',
            copyText: '', headline: '', landingUrl: '', sourceUrl: searchUrl,
            adId: '', adStartedAt: null, adLastShownAt: null, status: 'active',
            platform: 'meta',
          });
        }
      });

      const allTagged = cards.map(function(c) {
        return Object.assign({}, c, {
          keyword: term,
          searchType: type,
          // 브랜드 검색이라고 해서 advertiserName을 검색어로 덮어쓰지 않는다 —
          // Facebook 검색이 느슨하게 매칭돼서 무관한 광고주가 섞여 들어올 수 있어서,
          // 실제 DOM에서 추출한 광고주명을 그대로 유지해야 아래 필터가 의미가 있음
          advertiserName: c.advertiserName || '',
          id: 'meta_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          collectedAt: new Date().toISOString(),
        });
      });

      // 광고주 필터링
      // settings에 allowedAdvertiserPatterns가 있으면 키워드 검색 결과도 해당 패턴에 맞는 광고주만 허용
      // 없으면 기본 금융/증권/은행 패턴 사용
      const allowedPatterns = (settings.allowedAdvertiserPatterns || [
        '증권', '은행', '금융', '투자', '자산', '보험', '카드',
        '카카오뱅크', '카카오페이', '토스', '뱅크',
        '키움', '미래에셋', '삼성', 'NH', 'KB', '신한', '하나', '우리', 'SK',
        '한국투자', '대신', '교보', '흥국', '메리츠', '현대',
        '이베스트', '유안타', '하이투자', '부국', '케이프',
      ]).map(function(p) { return p.toLowerCase(); });

      // 키워드/브랜드 검색 모두 advertiserName이 금융/증권 관련 패턴과 매칭되는 것만 허용.
      // 브랜드 검색이라고 무조건 통과시키면 Facebook의 느슨한 검색 매칭 때문에
      // 무관한 광고주(예: 보험 마케팅 계정 등)가 섞여 들어오는 걸 막을 수 없어서
      // 타입 구분 없이 동일하게 필터링한다.
      // advertiserName이 비어있는 경우(네트워크 인터셉트로만 잡힌 미디어)는 제외
      const tagged = allTagged.filter(function(c) {
        var name = (c.advertiserName || '').toLowerCase().trim();
        if (!name) return false; // 광고주명 없으면 제외
        return allowedPatterns.some(function(p) { return name.includes(p); });
      });
      var filtered = allTagged.length - tagged.length;
      if (filtered > 0) {
        console.log(`[Meta] "${term}" (${type}) 비금융 광고주 ${filtered}개 제외`);
      }

      results.push(...tagged);
      console.log(`[Meta] "${term}" → ${tagged.length}개 (이미지: ${tagged.filter(t=>t.mediaType==='image').length}, 영상: ${tagged.filter(t=>t.mediaType==='video').length})`);
      await page.close();
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[Meta] "${term}" 오류:`, err.message);
    }
  }

  await browser.close();
  return results;
}

module.exports = { scrapeMeta };
