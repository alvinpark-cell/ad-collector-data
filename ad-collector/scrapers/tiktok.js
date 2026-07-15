/**
 * TikTok Creative Center 스크래퍼
 * ads.tiktok.com/business/creativecenter 에서 광고를 수집합니다.
 * 
 * ⚠️ 주의: TikTok Commercial Content Library(library.tiktok.com)는 EU 데이터만 제공합니다.
 * 한국 타겟 광고는 Creative Center의 Top Ads 큐레이션을 통해 수집합니다.
 */

const { chromium } = require('playwright');

async function scrapeTikTok(keywords, brands, settings) {
  const results = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    locale: 'ko-KR',
  });

  const allSearchTerms = [
    ...keywords.map(k => ({ term: k, type: 'keyword' })),
    ...brands.map(b => ({ term: b, type: 'brand' })),
  ];

  for (const { term, type } of allSearchTerms) {
    console.log(`[TikTok] 검색 중: "${term}" (${type})`);
    try {
      const page = await context.newPage();
      // Creative Center - Top Ads 섹션
      const url = `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/ko?period=7&region=KR&keyword=${encodeURIComponent(term)}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(4000);

      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2500);
      }

      const cards = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('[class*="topAds"], [class*="creative-card"], [class*="CardPc"]').forEach(card => {
          try {
            const video = card.querySelector('video');
            const img = card.querySelector('img[src*="tiktok"], img[src*="bytedance"]');
            const textEl = card.querySelector('[class*="title"], [class*="desc"]');
            const advertiserEl = card.querySelector('[class*="brand"], [class*="advertiser"]');

            const mediaEl = video || img;
            if (!mediaEl) return;

            items.push({
              mediaType: video ? 'video' : 'image',
              mediaUrl: video ? (video.src || video.querySelector('source')?.src || '') : img.src,
              advertiserName: advertiserEl?.innerText?.trim() || '',
              copyText: textEl?.innerText?.trim()?.slice(0, 200) || '',
              sourceUrl: window.location.href,
              platform: 'tiktok',
            });
          } catch (_) {}
        });
        return items;
      });

      const tagged = cards.map(c => ({
        ...c,
        keyword: term,
        searchType: type,
        advertiserName: type === 'brand' ? term : c.advertiserName,
        id: `tiktok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        collectedAt: new Date().toISOString(),
      }));

      results.push(...tagged);
      console.log(`[TikTok] "${term}" → ${cards.length}개 수집`);
      await page.close();
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[TikTok] "${term}" 오류:`, err.message);
    }
  }

  await browser.close();
  return results;
}

module.exports = { scrapeTikTok };
