const fs = require('fs');
const path = require('path');
const settings = require('./settings.json');
const { runAccount1 } = require('./scrapers/account1');
const { runAccount2 } = require('./scrapers/account2');
const { scrapeMeta } = require('./scrapers/meta');
const { scrapeGoogle } = require('./scrapers/google');
const { scrapeNaverBrandsearch } = require('./scrapers/naverBrandsearch');
const { scrapeNaverPowerlink } = require('./scrapers/naverPowerlink');
const { updatePowerlinkBrandKeyword } = require('./scrapers/powerlinkBrandKeyword');
const { updatePowerlinkInsight, updatePowerlinkBrandInsight } = require('./scrapers/powerlinkInsight');
const { loadIndex, saveIndex, getMonthWeekKey, updateCollectionStatus } = require('./utils');
const { processAndSaveItems } = require('./processItems');
const { generateSite } = require('./generateSite');
const { generateBrandsearchSite } = require('./generateBrandsearch');

const PWL_INDEX_PATH = path.join(settings.dataDir, 'powerlink_index.json');
const PWL_BRAND_INDEX_PATH = path.join(settings.dataDir, 'powerlink_brand_index.json');

/**
 * 메타 주 1회 수집 (기존 Playwright 키워드 스크래퍼 + Apify 메타데이터).
 * 스케줄러 쪽에서 공휴일 인지 요일 판정을 하고 이 함수를 호출하므로, 여기서는 요일을
 * 신경 쓰지 않고 "이번 주(주차 키)에 이미 했는지"만 확인한다(중복 실행 방지용 안전장치 -
 * 크론이 하루에 두 번 걸리거나 서버가 재시작되는 경우에 대비).
 */
async function runWeeklyMeta(settings, { force = false } = {}) {
  const currentWeekKey = getMonthWeekKey(new Date());
  const META_LAST_RUN_PATH = path.join(settings.dataDir, 'meta_last_run.json');
  const metaLastRun = fs.existsSync(META_LAST_RUN_PATH)
    ? JSON.parse(fs.readFileSync(META_LAST_RUN_PATH, 'utf-8'))
    : { weekKey: null };

  if (!force && metaLastRun.weekKey === currentWeekKey) {
    console.log(`\n[Meta] 이번 주(${currentWeekKey})에 이미 수집함 - 건너뜀`);
    return;
  }

  const existingIndex = loadIndex(path.join(settings.dataDir, 'index.json'));
  let allRaw = [];
  let metaSucceeded = false;

  // Meta 수집 (1) 기존 Playwright 스크래퍼로 "키워드"만 수집.
  try {
    console.log('[Meta/기존] 키워드 수집 시작');
    const metaResults = await scrapeMeta(settings.keywords, [], settings);
    allRaw.push(...metaResults);
    console.log(`[Meta/기존] ${metaResults.length}개 수집 완료`);
  } catch (e) { console.error('[Meta/기존] 오류:', e.message); }

  // Meta 수집 (2) Apify로 "증권"/"주식" 키워드 메타데이터 확보(광고주명에 증권/은행 붙은 곳 전부).
  // 여기서는 메타데이터만 저장한다(미디어 없이도 processItems.js가 허용) - 실제 이미지/영상은
  // 별도로 2시간마다 도는 metaMediaBatch.js가 하루 내내 나눠서 채운다.
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
    console.log(`[Meta/Apify] 기존에 이미 확보한 것 제외하면 ${gaps.length}건이 신규 - 메타데이터만 저장 (이미지/영상은 metaMediaBatch.js가 2시간마다 채움)`);

    allRaw.push(...gaps);
    metaSucceeded = true;
  } catch (e) { console.error('[Meta/Apify] 오류:', e.message); }

  const { newItems, finalIndex } = await processAndSaveItems(allRaw, settings);
  const metaNewCount = newItems.filter(i => i.platform === 'meta').length;
  console.log(`[Meta] 신규 저장 ${metaNewCount}개`);
  updateCollectionStatus(settings.dataDir, 'meta', { lastCollectedAt: new Date().toISOString(), newCount: metaNewCount });
  generateSite(finalIndex, settings);

  // --force-meta로 돌린 테스트 실행은 "이번 주 정식 수집"으로 치지 않음 - 그래야
  // 원래 주기에 자동 수집이 게이트에 막히지 않고 그대로 진행됨
  if (force) {
    console.log('[Meta] 강제 실행이라 이번 주 완료 기록은 남기지 않음');
  } else if (metaSucceeded) {
    fs.writeFileSync(META_LAST_RUN_PATH, JSON.stringify({ weekKey: currentWeekKey, ranAt: new Date().toISOString() }), 'utf-8');
  } else {
    console.log('[Meta] Apify 단계 실패 - 이번 주 완료 기록 남기지 않음 (다음 실행에서 재시도)');
  }
}

/**
 * 구글 주 1회 수집. 브랜드가 9개나 되고 광고주당 광고가 수백~1,000건 이상 나와서 전체가
 * 몇 시간씩 걸릴 수 있음 - 브랜드 하나 끝날 때마다 바로 저장해서, 중간에 끊겨도 그 지점까지는
 * 안전하게 남는다.
 */
async function runWeeklyGoogle(settings, { force = false } = {}) {
  const currentWeekKey = getMonthWeekKey(new Date());
  const GOOGLE_LAST_RUN_PATH = path.join(settings.dataDir, 'google_last_run.json');
  const googleLastRun = fs.existsSync(GOOGLE_LAST_RUN_PATH)
    ? JSON.parse(fs.readFileSync(GOOGLE_LAST_RUN_PATH, 'utf-8'))
    : { weekKey: null };

  if (!force && googleLastRun.weekKey === currentWeekKey) {
    console.log(`\n[Google] 이번 주(${currentWeekKey})에 이미 수집함 - 건너뜀`);
    return;
  }

  let googleNewCount = 0;
  try {
    console.log('\n[Google] 수집 시작 (주 1회)');
    await scrapeGoogle(settings.keywords, settings.brands, settings, async (brand, brandItems) => {
      if (brandItems.length === 0) return;
      const { newItems: brandNewItems, finalIndex } = await processAndSaveItems(brandItems, settings);
      googleNewCount += brandNewItems.length;
      console.log(`[Google] "${brand}" 저장 완료 (신규 ${brandNewItems.length}개, 누적 ${googleNewCount}개)`);
      generateSite(finalIndex, settings);
    });
    updateCollectionStatus(settings.dataDir, 'google', { lastCollectedAt: new Date().toISOString(), newCount: googleNewCount });
    if (force) {
      console.log('[Google] 강제 실행이라 이번 주 완료 기록은 남기지 않음');
    } else {
      fs.writeFileSync(GOOGLE_LAST_RUN_PATH, JSON.stringify({ weekKey: currentWeekKey, ranAt: new Date().toISOString() }), 'utf-8');
    }
  } catch (e) { console.error('[Google] 오류:', e.message); }
}

/**
 * 네이버 파워링크(일반 키워드 "증권"/"주식") 수집 - 키워드마다 PC/MO 15개씩 이미지까지
 * 다운로드하는 작업. 스케줄러에서 월/수/금 지정된 요일에만 호출한다(그 요일이 공휴일이면
 * 스케줄러가 아예 호출하지 않고 건너뜀 - 이미 주 3회라 대체일 없이 그냥 스킵).
 */
async function runWeeklyPowerlink(settings, { force = false } = {}) {
  const currentWeekKey = getMonthWeekKey(new Date());
  const existingPwlIndex = loadIndex(PWL_INDEX_PATH);
  let newPwlItems = [];

  try {
    const existingPwlWeekKeys = new Set(
      existingPwlIndex.map(i => `${i.keyword}_${i.device}_${getMonthWeekKey(i.collectedAt)}`)
    );
    const keywordsNeedingCollection = force ? (settings.powerlinkKeywords || []).slice() : (settings.powerlinkKeywords || []).filter(keyword =>
      ['pc', 'mo'].some(device => !existingPwlWeekKeys.has(`${keyword}_${device}_${currentWeekKey}`))
    );

    if (keywordsNeedingCollection.length === 0) {
      console.log(`\n[네이버 파워링크] 이번 주(${currentWeekKey})에 전체 키워드 이미 수집함 - 건너뜀`);
      return;
    }

    console.log('\n[네이버 파워링크] 수집 시작 (대상: ' + keywordsNeedingCollection.join(', ') + ')');
    const pwlResults = await scrapeNaverPowerlink(keywordsNeedingCollection, settings.outputDir);
    const rawPwlItems = pwlResults.filter(Boolean);

    newPwlItems = rawPwlItems.filter(item => {
      const key = `${item.keyword}_${item.device}_${currentWeekKey}`;
      if (!force && existingPwlWeekKeys.has(key)) {
        console.log(`[파워링크 중복 스킵] ${item.keyword} ${item.device} (이번 주 이미 수집됨)`);
        return false;
      }
      return true;
    });

    console.log('[네이버 파워링크] ' + newPwlItems.length + '개 수집 (중복 ' + (rawPwlItems.length - newPwlItems.length) + '개 제외)');
  } catch (e) { console.error('[네이버 파워링크] 오류:', e.message); }

  const newPwlKeys = new Set(newPwlItems.map(i => `${i.keyword}_${i.device}_${currentWeekKey}`));
  const keptExistingPwlIndex = force
    ? existingPwlIndex.filter(i => !newPwlKeys.has(`${i.keyword}_${i.device}_${getMonthWeekKey(i.collectedAt)}`))
    : existingPwlIndex;
  const updatedPwlIndex = [...keptExistingPwlIndex, ...newPwlItems];
  saveIndex(PWL_INDEX_PATH, updatedPwlIndex);
  updateCollectionStatus(settings.dataDir, 'powerlink', { lastCollectedAt: new Date().toISOString(), newCount: newPwlItems.length });
  try {
    console.log('\n[파워링크 인사이트] 갱신 시작');
    await updatePowerlinkInsight(settings);
  } catch (e) { console.error('[파워링크 인사이트] 오류:', e.message); }
}

/**
 * 네이버 브랜드검색 + 검색광고 브랜드키워드 - 평일 13시마다 도는 이 collect()가 그대로
 * 전담한다(주 1회, "이번 주에 이미 했는지"로 게이트). 메타/구글/파워링크(일반)는 각각
 * runWeeklyMeta/runWeeklyGoogle/runWeeklyPowerlink로 분리되어 스케줄러가 공휴일을
 * 감안한 별도 시각에 직접 호출한다 - 이 함수 안에서는 더 이상 다루지 않는다.
 */
async function collect() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('브랜드검색/검색광고 브랜드키워드 수집 시작: ' + new Date().toLocaleString('ko-KR'));
  console.log('========================================\n');

  const existingBsIndex = loadIndex(path.join(settings.dataDir, 'bs_index.json'));
  console.log('기존 브검 항목: ' + existingBsIndex.length + '개\n');

  const currentWeekKey = getMonthWeekKey(new Date());

  // 테스트/수동 확인용 강제 실행 플래그
  const forceAll = process.argv.includes('--force-all');
  const forceBs = forceAll || process.argv.includes('--force-bs');
  const forcePwlBrand = forceAll || process.argv.includes('--force-pwl-brand');
  if (forceBs) console.log('[네이버 브랜드검색] 게이트 무시하고 강제 실행');
  if (forcePwlBrand) console.log('[검색광고 브랜드키워드] 게이트 무시하고 강제 실행');

  // 네이버 브랜드검색 수집 - 주 1회만 실행 (브랜드마다 PC/MO 스크린샷+랜딩 캡처까지 하는
  // 무거운 작업이라 매일 도는 이 collect()에서 매번 돌릴 필요 없음. 브랜드별로 이번 주에
  // 이미 수집된 게 있으면 그 브랜드+디바이스만 건너뛰고, 새 브랜드가 추가되면 그것만 수집)
  let newBsItems = [];
  let bsRanThisTime = false;
  try {
    const existingBsWeekKeys = new Set(
      existingBsIndex.map(i => `${i.advertiserName}_${i.device}_${getMonthWeekKey(i.collectedAt)}`)
    );
    const brandsNeedingCollection = forceBs ? settings.brands.slice() : settings.brands.filter(brand =>
      ['pc', 'mo'].some(device => !existingBsWeekKeys.has(`${brand}_${device}_${currentWeekKey}`))
    );

    if (brandsNeedingCollection.length === 0) {
      console.log(`\n[네이버 브랜드검색] 이번 주(${currentWeekKey})에 전체 브랜드 이미 수집함 - 건너뜀`);
    } else {
      bsRanThisTime = true;
      console.log('\n[네이버 브랜드검색] 수집 시작 (주 1회, 대상: ' + brandsNeedingCollection.join(', ') + ')');
      const bsResults = await scrapeNaverBrandsearch(brandsNeedingCollection, settings.outputDir);
      const rawBsItems = bsResults.filter(Boolean);

      newBsItems = rawBsItems.filter(item => {
        const key = `${item.advertiserName}_${item.device}_${currentWeekKey}`;
        if (!forceBs && existingBsWeekKeys.has(key)) {
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

  // --force-bs로 다시 수집한 경우 "덧붙이기"가 아니라 "덮어쓰기"가 되도록, 이번 주에
  // 이미 있던 같은 브랜드+디바이스 항목은 새 걸로 교체(제거 후 추가)한다.
  const newBsKeys = new Set(newBsItems.map(i => `${i.advertiserName}_${i.device}_${currentWeekKey}`));
  const keptExistingBsIndex = forceBs
    ? existingBsIndex.filter(i => !newBsKeys.has(`${i.advertiserName}_${i.device}_${getMonthWeekKey(i.collectedAt)}`))
    : existingBsIndex;
  const updatedBsIndex = [...keptExistingBsIndex, ...newBsItems];
  saveIndex(path.join(settings.dataDir, 'bs_index.json'), updatedBsIndex);
  if (bsRanThisTime) {
    updateCollectionStatus(settings.dataDir, 'brandsearch', { lastCollectedAt: new Date().toISOString(), newCount: newBsItems.length });
  }

  // 검색광고 브랜드키워드 - 9개 브랜드명 자체를 키워드로 파워링크 수집. 한 번 돌 때
  // 브랜드×기기(9×2)마다 페이지를 30회씩 새로고침해서 시간이 꽤 걸리므로 주 1회로 제한.
  let newPwlBrandCount = 0;
  try {
    const existingPwlBrandIndex = loadIndex(PWL_BRAND_INDEX_PATH);
    const alreadyDoneThisWeek = existingPwlBrandIndex.some(i => i.weekKey === currentWeekKey);
    if (!forcePwlBrand && alreadyDoneThisWeek) {
      console.log(`\n[검색광고 브랜드키워드] 이번 주(${currentWeekKey}) 이미 수집함 - 건너뜀`);
    } else {
      console.log('\n[검색광고 브랜드키워드] 수집 시작 (주 1회, 브랜드마다 새로고침 30회라 시간이 꽤 걸립니다)');
      const finalBrandIndex = await updatePowerlinkBrandKeyword(settings);
      newPwlBrandCount = finalBrandIndex.filter(i => i.weekKey === currentWeekKey).length;
      updateCollectionStatus(settings.dataDir, 'powerlinkBrand', { lastCollectedAt: new Date().toISOString(), newCount: newPwlBrandCount });
      try {
        console.log('\n[검색광고 브랜드키워드 인사이트] 갱신 시작');
        await updatePowerlinkBrandInsight(settings);
      } catch (e) { console.error('[검색광고 브랜드키워드 인사이트] 오류:', e.message); }
    }
  } catch (e) { console.error('[검색광고 브랜드키워드] 오류:', e.message); }

  // HTML 생성 (레거시 정적 사이트 - 브검 전용)
  generateBrandsearchSite(updatedBsIndex, settings);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n========================================');
  console.log('완료! (' + elapsed + '초 소요)');
  console.log('  브검: ' + updatedBsIndex.length + '개 (신규: ' + newBsItems.length + ')');
  console.log('  검색광고 브랜드키워드: 이번 주 처리 ' + newPwlBrandCount + '건');
  console.log('========================================\n');
}

module.exports = { collect, runWeeklyMeta, runWeeklyGoogle, runWeeklyPowerlink };
if (require.main === module) {
  const forceAll = process.argv.includes('--force-all');
  const runMeta = forceAll || process.argv.includes('--force-meta');
  const runGoogle = forceAll || process.argv.includes('--force-google');
  const runPwl = forceAll || process.argv.includes('--force-pwl');

  (async () => {
    if (runMeta) await runWeeklyMeta(settings, { force: true });
    if (runGoogle) await runWeeklyGoogle(settings, { force: true });
    if (runPwl) await runWeeklyPowerlink(settings, { force: true });
    await collect();
  })().catch(err => { console.error('오류:', err); process.exit(1); });
}
