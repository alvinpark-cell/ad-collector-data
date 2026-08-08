/**
 * 검색광고 브랜드키워드 - 9개 경쟁사 브랜드명 각각을 키워드로 파워링크를 검색해서,
 * 한 번의 수집 실행 안에서 페이지를 30회 새로고침하며 그때그때 다르게 노출되는
 * 다양한 소재(제목/설명/서브링크/추가제목)를 모은다. 중복 소재는 제외하고 신규 소재만
 * 누적하며, 30회를 다 새로고침해도 그 브랜드 광고가 한 번도 안 잡히면
 * "광고 미집행 중"으로 표시한다.
 *
 * 기존 "증권"/"주식" 일반 키워드 수집(naverPowerlink.js)과는 별개 - 그쪽은 로직을
 * 그대로 두고 파싱만(서브링크/추가제목) 공용으로 확장했을 뿐이라, 여기서는 그 확장된
 * extractAds/buildPowerlinkUrl/downloadAdImages를 그대로 재사용한다.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { buildPowerlinkUrl, extractAds, downloadAdImages, MAX_ADS } = require('./naverPowerlink');
const { loadIndex, saveIndex, getMonthWeekKey } = require('../utils');
const { matchesBrand } = require('../brandUtils');

const REFRESH_COUNT = 30;

function adKey(ad) {
  return [
    ad.advertiserName || '', ad.title || '', ad.description || '',
    (ad.sublinks || []).map(s => s.title).join(','),
    ad.extraTitle ? ad.extraTitle.text : '',
  ].join('::');
}

async function collectBrandDevice(browser, brand, device, screenshotDir) {
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
  await page.goto(buildPowerlinkUrl(brand, device), { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const seen = new Set();
  const uniqueAds = [];

  for (let i = 0; i < REFRESH_COUNT; i++) {
    if (i > 0) {
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1200);
    }
    let raw = [];
    try {
      raw = await extractAds(page, isMobile);
    } catch (e) {
      console.log(`    [${i + 1}/${REFRESH_COUNT}] 파싱 오류: ${e.message}`);
      continue;
    }
    // 브랜드명으로 검색해도 결과 페이지엔 그 키워드에 입찰한 다른 광고주들이 같이 뜬다
    // (파워링크는 키워드 경매라 당연함). 이 탭은 "그 브랜드 자신이 낸 소재"만 모으는
    // 용도라 광고주명이 검색한 브랜드와 실제로 일치하는 것만 남긴다.
    const own = raw.filter(ad => matchesBrand(ad.advertiserName, brand));
    for (const ad of own.slice(0, MAX_ADS)) {
      const key = adKey(ad);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueAds.push(ad);
    }
  }

  if (uniqueAds.length > 0) {
    await downloadAdImages(context, uniqueAds, brand, device, screenshotDir);
  }
  await context.close();
  return uniqueAds;
}

async function updatePowerlinkBrandKeyword(settings, brandsOverride) {
  const brands = brandsOverride || settings.brands || [];
  const outputDir = settings.outputDir;
  const screenshotDir = path.join(outputDir, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const indexPath = path.join(settings.dataDir, 'powerlink_brand_index.json');
  const existingIndex = loadIndex(indexPath);
  const weekKey = getMonthWeekKey(new Date());
  // 이번에 수집하는 브랜드의 이번 주 항목만 새 걸로 교체한다 - brandsOverride로 브랜드 하나만
  // 테스트/재수집할 때 다른 브랜드의 이번 주 데이터까지 같이 지워지면 안 되기 때문.
  const brandsSet = new Set(brands);
  const keptExisting = existingIndex.filter(e => e.weekKey !== weekKey || !brandsSet.has(e.brand));
  const newEntries = [];

  const browser = await chromium.launch({ headless: true });

  for (const brand of brands) {
    console.log(`[검색광고 브랜드키워드] "${brand}" 수집 중 (새로고침 ${REFRESH_COUNT}회)...`);
    for (const device of ['pc', 'mo']) {
      try {
        const ads = await collectBrandDevice(browser, brand, device, screenshotDir);
        const status = ads.length > 0 ? 'collected' : 'no-ads';
        console.log(`  [${device.toUpperCase()}] ${ads.length > 0 ? `${ads.length}개 신규 소재 확보` : '광고 미집행 중'}`);
        newEntries.push({
          brand, device, weekKey, status, ads,
          refreshCount: REFRESH_COUNT,
          collectedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error(`  [${device.toUpperCase()}] 오류:`, e.message);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  await browser.close();

  // 저장 시점에 파일을 다시 읽어서 병합한다 - 브랜드 9개 x 디바이스 2개 x 새로고침 30회라
  // 이 함수 호출 자체가 오래 걸릴 수 있는데, 그 사이 다른 프로세스가 같은 파일에 이미 쓴
  // 내용이 있다면 그걸 덮어쓰지 않기 위함(2026-08-07, 다른 백필 스크립트에서 같은 패턴으로
  // 데이터 손실 발견 후 전체 점검). "이번에 수집한 브랜드의 이번 주 항목 교체"라는 원래
  // 의도는 그대로, 기준이 되는 기존 데이터만 최신 걸로 다시 읽는다.
  const freshIndex = loadIndex(indexPath);
  const freshKeptExisting = freshIndex.filter(e => e.weekKey !== weekKey || !brandsSet.has(e.brand));
  const finalIndex = [...freshKeptExisting, ...newEntries];
  saveIndex(indexPath, finalIndex);
  console.log('[검색광고 브랜드키워드] powerlink_brand_index.json 갱신 완료');
  return finalIndex;
}

module.exports = { updatePowerlinkBrandKeyword };
if (require.main === module) {
  const settings = require('../settings.json');
  const brandsArg = process.argv[2] ? [process.argv[2]] : undefined;
  updatePowerlinkBrandKeyword(settings, brandsArg).catch(err => { console.error('오류:', err); process.exit(1); });
}
