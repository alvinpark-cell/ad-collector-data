/**
 * 네이버 파워링크 스크래퍼 - PC / MO (v2: "전체보기" 전용 페이지 기반)
 * 메인 검색결과 화면은 PC 10개/MO 5개로 제한되어 있어서, 파워링크 전용
 * "전체보기" 페이지(ad.search.naver.com / m.ad.search.naver.com)를 직접
 * 방문해 PC/MO 둘 다 최대 15개까지 동일하게 확보한다. 이 페이지는 덤으로
 * "광고집행기간"(얼마나 오래 광고 중인지)도 제공한다.
 *
 * 실제 랜딩 도메인은 onclick="goOtherCR(this,...d="+urlencode(...)/encodeURIComponent(...))"에
 * 평문으로 들어있어 리다이렉트를 따라갈 필요가 없음.
 *
 * 화면 전체 스크린샷 대신 광고별 원본 썸네일 이미지를 개별 다운로드한다
 * (15개짜리 스크롤 리스트를 한 장으로 캡처하는 것보다 이게 더 실용적).
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MAX_ADS = 15;

async function scrapeNaverPowerlink(keywords, outputDir) {
  const results = [];
  const screenshotDir = path.join(outputDir, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const keyword of keywords) {
    console.log(`[파워링크] "${keyword}" 수집 중...`);
    for (const device of ['pc', 'mo']) {
      try {
        const result = await collectPowerlink(browser, keyword, device, screenshotDir);
        if (result) {
          console.log(`  [${device.toUpperCase()}] ${result.ads.length}개 광고 수집`);
          results.push(result);
        } else {
          console.log(`  [${device.toUpperCase()}] 파워링크 없음`);
        }
      } catch (e) {
        console.error(`  [${device.toUpperCase()}] 오류:`, e.message);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  await browser.close();
  return results;
}

// "전체보기" 전용 페이지 URL - PC/MO 둘 다 최대 15개 확보 가능 (메인 검색결과의 10개/5개 제한 우회)
function buildPowerlinkUrl(keyword, device) {
  return device === 'mo'
    ? `https://m.ad.search.naver.com/search.naver?where=m_expd&query=${encodeURIComponent(keyword)}`
    : `https://ad.search.naver.com/search.naver?where=ad&query=${encodeURIComponent(keyword)}`;
}

// 현재 렌더된 페이지에서 광고 목록을 파싱 - 브랜드키워드 수집기(powerlinkBrandKeyword.js)가
// 같은 페이지를 여러 번 새로고침하며 이 함수만 반복 호출할 수 있도록 별도 함수로 분리.
async function extractAds(page, isMobile) {
  return await page.evaluate(function(isMobileArg) {
    var lis = isMobileArg ? document.querySelectorAll('li.list_item') : document.querySelectorAll('.lst_type > li');
    var out = [];

    lis.forEach(function(li, idx) {
      var mainLink = li.querySelector('a[onclick*="goOtherCR"]');
      var onclickAttr = mainLink ? (mainLink.getAttribute('onclick') || '') : '';
      var dMatch = onclickAttr.match(/urlencode\("([^"]+)"\)|encodeURIComponent\("([^"]+)"\)/);
      var idMatch = onclickAttr.match(/i=([\w-]+)/);

      var siteEl = li.querySelector('.site');
      var urlEl = isMobileArg ? li.querySelector('.url_link') : li.querySelector('.url');
      // .tit/.lnk_tit는 "광고집행기간" 라벨에도 재사용되는 클래스라 그 텍스트는 제외
      var titSelector = isMobileArg ? '.tit' : '.lnk_tit';
      var titEls = Array.from(li.querySelectorAll(titSelector)).filter(function(e) {
        return e.textContent.trim() !== '광고집행기간';
      });
      var descEl = li.querySelector(isMobileArg ? '.desc' : '.link_desc');
      var periodEl = li.querySelector('em.txt');
      var img = Array.from(li.querySelectorAll('img')).find(function(im) {
        return !im.className.includes('favicon') && (im.src || im.getAttribute('data-lazysrc1'));
      });

      var landingUrl = dMatch ? (dMatch[1] || dMatch[2]) : null;
      var site = siteEl ? siteEl.textContent.trim() : null;
      if (!site && !landingUrl) return; // 광고 슬롯이 아닌 노이즈 요소 제외

      // 서브링크(sitelink) - "ul.lst_link > li.item > a.link" 형태의 텍스트 링크 3~4개.
      // 이미지가 붙은 서브링크(이미지형 서브링크)는 실제로는 못 봤지만, 혹시 있으면
      // sublinks가 아니라 imageSublinks로 따로 분류되도록 방어적으로 처리.
      var sublinks = [];
      var imageSublinks = [];
      Array.from(li.querySelectorAll('ul.lst_link > li.item')).forEach(function(item) {
        var a = item.querySelector('a');
        if (!a) return;
        var subImg = item.querySelector('img');
        var entry = { title: a.textContent.trim(), url: a.href };
        if (subImg) {
          entry.imageUrl = subImg.src || subImg.getAttribute('data-lazysrc1');
          imageSublinks.push(entry);
        } else {
          sublinks.push(entry);
        }
      });

      // 추가제목(확장소재) - "이벤트"/"할인"/"신상품" 같은 배지 + 별도 타이틀이 붙는
      // link_ext_desc 블록. data-promotion 속성에도 배지 텍스트가 중복으로 들어있음.
      var extDescEl = li.querySelector('a.link_ext_desc');
      var extraTitle = null;
      if (extDescEl) {
        var prefixEl = extDescEl.querySelector('.prefix_ext');
        var titleExtEl = extDescEl.querySelector('.title_ext');
        extraTitle = {
          badge: prefixEl ? prefixEl.textContent.trim() : (li.getAttribute('data-promotion') || ''),
          text: titleExtEl ? titleExtEl.textContent.trim() : '',
          url: extDescEl.href,
        };
      }

      out.push({
        rank: idx + 1,
        advertiserName: site,
        displayUrl: urlEl ? urlEl.textContent.trim() : null,
        title: titEls.map(function(e) { return e.textContent.trim(); }).join(' '),
        description: descEl ? descEl.textContent.trim() : null,
        adPeriod: periodEl ? periodEl.textContent.trim() : null,
        landingUrl: landingUrl,
        adId: idMatch ? idMatch[1] : null,
        imageUrl: img ? (img.src || img.getAttribute('data-lazysrc1')) : null,
        sublinks: sublinks,
        imageSublinks: imageSublinks,
        extraTitle: extraTitle,
      });
    });

    return out;
  }, isMobile);
}

// 광고별 원본 썸네일 이미지를 다운로드하고 로컬 경로를 채워 넣는다 (제자리에서 ad를 수정).
async function downloadAdImages(context, ads, keyword, device, screenshotDir) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (const ad of ads) {
    if (!ad.imageUrl || ad.localImage) continue;
    try {
      const resp = await context.request.get(ad.imageUrl, { timeout: 10000 });
      if (resp.ok()) {
        const ext = (ad.imageUrl.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) || [, 'jpg'])[1].toLowerCase();
        const unique = Math.random().toString(36).slice(2, 6);
        const filename = `pwl_img_${keyword}_${device}_${ad.rank}_${date}_${unique}.${ext}`;
        fs.writeFileSync(path.join(screenshotDir, filename), await resp.body());
        ad.localImage = 'screenshots/' + filename;
      }
    } catch (e) {
      console.log(`    [이미지 다운로드 실패] ${ad.advertiserName}: ${e.message}`);
    }
  }
}

async function collectPowerlink(browser, keyword, device, screenshotDir) {
  const isMobile = device === 'mo';
  const context = await browser.newContext({
    locale: 'ko-KR',
    viewport: isMobile ? { width: 390, height: 2400 } : { width: 1280, height: 2000 },
    userAgent: isMobile
      ? 'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    isMobile, hasTouch: isMobile,
  });
  const page = await context.newPage();

  await page.goto(buildPowerlinkUrl(keyword, device), { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const raw = await extractAds(page, isMobile);

  if (raw.length === 0) {
    await context.close();
    return null;
  }

  const ads = raw.slice(0, MAX_ADS);
  await downloadAdImages(context, ads, keyword, device, screenshotDir);
  await context.close();

  return {
    id: `powerlink_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    platform: 'naver_powerlink',
    device,
    keyword,
    ads,
    collectedAt: new Date().toISOString(),
  };
}

module.exports = { scrapeNaverPowerlink, buildPowerlinkUrl, extractAds, downloadAdImages, MAX_ADS };
