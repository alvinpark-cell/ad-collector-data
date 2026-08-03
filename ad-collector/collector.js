const fs = require('fs');
const path = require('path');
const settings = require('./settings.json');
const { runAccount1 } = require('./scrapers/account1');
const { runAccount2 } = require('./scrapers/account2');
const { hydrateWithMedia } = require('./scrapers/metaAdDetail');
const { scrapeMeta } = require('./scrapers/meta');
const { scrapeGoogle } = require('./scrapers/google');
const { scrapeNaverBrandsearch } = require('./scrapers/naverBrandsearch');
const { scrapeNaverPowerlink } = require('./scrapers/naverPowerlink');
const { loadIndex, saveIndex, getMonthWeekKey } = require('./utils');
const { processAndSaveItems } = require('./processItems');
const { generateSite } = require('./generateSite');
const { generateBrandsearchSite } = require('./generateBrandsearch');

const BS_INDEX_PATH = path.join(settings.dataDir, 'bs_index.json');
const PWL_INDEX_PATH = path.join(settings.dataDir, 'powerlink_index.json');

async function collect() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('광고 수집 시작: ' + new Date().toLocaleString('ko-KR'));
  console.log('========================================\n');

  const existingIndex = loadIndex(path.join(settings.dataDir, 'index.json'));
  const existingBsIndex = loadIndex(BS_INDEX_PATH);
  const existingPwlIndex = loadIndex(PWL_INDEX_PATH);
  console.log('기존 항목: ' + existingIndex.length + '개 (브검: ' + existingBsIndex.length + '개, 파워링크: ' + existingPwlIndex.length + '개)\n');

  // Meta 수집 (1) 기존 Playwright 스크래퍼로 "키워드"만 수집.
  // 브랜드 9개는 여기서 같이 안 돌리고 metaBrandBatch.js가 2시간마다 3개씩 나눠서 전담한다
  // (한 번에 몰아서 요청하면 Facebook 자동화 탐지에 걸릴 위험이 있어서 시간을 두고 분산).
  let allRaw = [];
  try {
    console.log('[Meta/기존] 키워드 수집 시작');
    const metaResults = await scrapeMeta(settings.keywords, [], settings);
    allRaw.push(...metaResults);
    console.log(`[Meta/기존] ${metaResults.length}개 수집 완료`);
  } catch (e) { console.error('[Meta/기존] 오류:', e.message); }

  // Meta 수집 (2) Apify로 9개 브랜드 메타데이터 확보 → 기존 index.json에 이미 있는 건 제외하고
  // "구멍"만 Playwright 개별 방문으로 보완 (adId 기준 대조, 방문 개수 제한 + 넉넉한 텀)
  try {
    console.log('\n[Meta/Apify] 메타데이터 수집 시작');
    const [account1Meta, account2Meta] = await Promise.all([
      runAccount1(settings),
      runAccount2(settings),
    ]);
    const allMeta = [...account1Meta, ...account2Meta];
    console.log(`[Meta/Apify] 메타데이터 ${allMeta.length}건 확보`);

    const alreadyCoveredAdIds = new Set(existingIndex.map(i => i.adId).filter(Boolean));
    const gaps = allMeta.filter(m => m.adId && !alreadyCoveredAdIds.has(m.adId));
    console.log(`[Meta/Apify] 기존에 이미 확보한 것 제외하면 ${gaps.length}건이 "구멍" — 보조 방문 시작`);

    const apifyResults = await hydrateWithMedia(gaps, settings.metaDetailMaxVisitsPerRun);
    allRaw.push(...apifyResults);
    console.log(`[Meta/Apify] 보조 미디어 추출 완료: ${apifyResults.length}행`);
  } catch (e) { console.error('[Meta/Apify] 오류:', e.message); }

  // Google 수집 - 월 1회만 실행 (카드마다 상세페이지 방문해서 마지막 게재일을 긁어오는데,
  // 이 작업을 매일 도는 이 collect()에서 매번 돌리면 시간도 오래 걸리고 불필요함)
  const GOOGLE_LAST_RUN_PATH = path.join(settings.dataDir, 'google_last_run.json');
  const currentMonthKey = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const googleLastRun = fs.existsSync(GOOGLE_LAST_RUN_PATH)
    ? JSON.parse(fs.readFileSync(GOOGLE_LAST_RUN_PATH, 'utf-8'))
    : { monthKey: null };

  if (googleLastRun.monthKey === currentMonthKey) {
    console.log(`\n[Google] 이번 달(${currentMonthKey})에 이미 수집함 - 건너뜀`);
  } else {
    try {
      console.log('\n[Google] 수집 시작 (월 1회)');
      const googleResults = await scrapeGoogle(settings.keywords, settings.brands, settings);
      allRaw.push(...googleResults);
      fs.writeFileSync(GOOGLE_LAST_RUN_PATH, JSON.stringify({ monthKey: currentMonthKey, ranAt: new Date().toISOString() }), 'utf-8');
    } catch (e) { console.error('[Google] 오류:', e.message); }
  }

  console.log('\n총 수집(중복제거 전): ' + allRaw.length + '개');

  const { newItems, finalIndex, newAds, endedAds } = await processAndSaveItems(allRaw, settings);
  console.log('신규 항목(중복 제외): ' + newItems.length + '개');
  console.log('신규 광고: ' + newAds.length + '개, 종료 광고: ' + endedAds.length + '개');

  // 네이버 브랜드검색 수집 - 주 1회만 실행 (브랜드마다 PC/MO 스크린샷+랜딩 캡처까지 하는
  // 무거운 작업이라 매일 도는 이 collect()에서 매번 돌릴 필요 없음. 브랜드별로 이번 주에
  // 이미 수집된 게 있으면 그 브랜드+디바이스만 건너뛰고, 새 브랜드가 추가되면 그것만 수집)
  const currentWeekKey = getMonthWeekKey(new Date());
  let newBsItems = [];
  try {
    const existingBsWeekKeys = new Set(
      existingBsIndex.map(i => `${i.advertiserName}_${i.device}_${getMonthWeekKey(i.collectedAt)}`)
    );
    const brandsNeedingCollection = settings.brands.filter(brand =>
      ['pc', 'mo'].some(device => !existingBsWeekKeys.has(`${brand}_${device}_${currentWeekKey}`))
    );

    if (brandsNeedingCollection.length === 0) {
      console.log(`\n[네이버 브랜드검색] 이번 주(${currentWeekKey})에 전체 브랜드 이미 수집함 - 건너뜀`);
    } else {
      console.log('\n[네이버 브랜드검색] 수집 시작 (주 1회, 대상: ' + brandsNeedingCollection.join(', ') + ')');
      const bsResults = await scrapeNaverBrandsearch(brandsNeedingCollection, settings.outputDir);
      const rawBsItems = bsResults.filter(Boolean);

      newBsItems = rawBsItems.filter(item => {
        const key = `${item.advertiserName}_${item.device}_${currentWeekKey}`;
        if (existingBsWeekKeys.has(key)) {
          console.log(`[브검 중복 스킵] ${item.advertiserName} ${item.device} (이번 주 이미 수집됨)`);
          const ssPath = path.join(settings.outputDir, item.localPath);
          if (fs.existsSync(ssPath)) fs.unlink(ssPath, () => {});
          return false;
        }
        return true;
      });

      console.log('[네이버 브랜드검색] ' + newBsItems.length + '개 수집 (중복 ' + (rawBsItems.length - newBsItems.length) + '개 제외)');
    }
  } catch (e) { console.error('[네이버 브랜드검색] 오류:', e.message); }

  const updatedBsIndex = [...existingBsIndex, ...newBsItems];
  saveIndex(BS_INDEX_PATH, updatedBsIndex);

  // 네이버 파워링크 모니터링 수집 - 주 1회만 실행 (키워드마다 PC/MO 15개씩 이미지까지
  // 다운로드하는 작업이라 매일 돌릴 필요 없음)
  let newPwlItems = [];
  try {
    const existingPwlWeekKeys = new Set(
      existingPwlIndex.map(i => `${i.keyword}_${i.device}_${getMonthWeekKey(i.collectedAt)}`)
    );
    const keywordsNeedingCollection = (settings.powerlinkKeywords || []).filter(keyword =>
      ['pc', 'mo'].some(device => !existingPwlWeekKeys.has(`${keyword}_${device}_${currentWeekKey}`))
    );

    if (keywordsNeedingCollection.length === 0) {
      console.log(`\n[네이버 파워링크] 이번 주(${currentWeekKey})에 전체 키워드 이미 수집함 - 건너뜀`);
    } else {
      console.log('\n[네이버 파워링크] 수집 시작 (주 1회, 대상: ' + keywordsNeedingCollection.join(', ') + ')');
      const pwlResults = await scrapeNaverPowerlink(keywordsNeedingCollection, settings.outputDir);
      const rawPwlItems = pwlResults.filter(Boolean);

      newPwlItems = rawPwlItems.filter(item => {
        const key = `${item.keyword}_${item.device}_${currentWeekKey}`;
        if (existingPwlWeekKeys.has(key)) {
          console.log(`[파워링크 중복 스킵] ${item.keyword} ${item.device} (이번 주 이미 수집됨)`);
          return false;
        }
        return true;
      });

      console.log('[네이버 파워링크] ' + newPwlItems.length + '개 수집 (중복 ' + (rawPwlItems.length - newPwlItems.length) + '개 제외)');
    }
  } catch (e) { console.error('[네이버 파워링크] 오류:', e.message); }

  const updatedPwlIndex = [...existingPwlIndex, ...newPwlItems];
  saveIndex(PWL_INDEX_PATH, updatedPwlIndex);

  // HTML 생성
  console.log('\nHTML 페이지 생성 중...');
  generateSite(finalIndex, settings);
  generateBrandsearchSite(updatedBsIndex, settings);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n========================================');
  console.log('완료! (' + elapsed + '초 소요)');
  console.log('  광고: ' + finalIndex.length + '개 (신규: ' + newItems.length + ', 종료: ' + endedAds.length + ')');
  console.log('  브검: ' + updatedBsIndex.length + '개 (신규: ' + newBsItems.length + ')');
  console.log('  파워링크: ' + updatedPwlIndex.length + '개 (신규: ' + newPwlItems.length + ')');
  console.log('========================================\n');
}

module.exports = { collect };
if (require.main === module) {
  collect().catch(err => { console.error('오류:', err); process.exit(1); });
}
