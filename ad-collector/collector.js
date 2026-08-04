const fs = require('fs');
const path = require('path');
const settings = require('./settings.json');
const { runAccount1 } = require('./scrapers/account1');
const { runAccount2 } = require('./scrapers/account2');
const { scrapeMeta } = require('./scrapers/meta');
const { scrapeGoogle } = require('./scrapers/google');
const { scrapeNaverBrandsearch } = require('./scrapers/naverBrandsearch');
const { scrapeNaverPowerlink } = require('./scrapers/naverPowerlink');
const { loadIndex, saveIndex, getMonthWeekKey, updateCollectionStatus } = require('./utils');
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

  let allRaw = [];
  // 브검/파워링크와 동일한 주차 키를 메타/구글에도 그대로 써서 네 가지 수집을 전부 주 1회,
  // 같은 타이밍에 묶어서 진행한다 (Apify 실제 비용을 확인해보니 한 번에 $0.05 수준으로 아주
  // 저렴해서, 굳이 월 1회로 따로 뺄 필요 없이 주 1회로 같이 돌려도 무방하다고 판단함)
  const currentWeekKey = getMonthWeekKey(new Date());

  // 테스트/수동 확인용 강제 실행 플래그: node collector.js --force-meta (또는 --force-google)
  // 로 실행하면 이번 주에 이미 돌았어도 그 매체만 강제로 돈다.
  // node collector.js --force-all 로 실행하면 이번 주에 뭘 이미 했든 전부 무시하고
  // 메타/구글/브검/파워링크 전부 다시 수집한다(덮어쓰기 개념). 매체별로 따로 강제하고
  // 싶으면 --force-meta/--force-google/--force-bs/--force-pwl 개별 플래그도 가능.
  const forceAll = process.argv.includes('--force-all');
  const forceMeta = forceAll || process.argv.includes('--force-meta');
  const forceGoogle = forceAll || process.argv.includes('--force-google');
  const forceBs = forceAll || process.argv.includes('--force-bs');
  const forcePwl = forceAll || process.argv.includes('--force-pwl');
  if (forceMeta) console.log('[Meta] 게이트 무시하고 강제 실행');
  if (forceGoogle) console.log('[Google] 게이트 무시하고 강제 실행');
  if (forceBs) console.log('[네이버 브랜드검색] 게이트 무시하고 강제 실행');
  if (forcePwl) console.log('[네이버 파워링크] 게이트 무시하고 강제 실행');

  // Meta 수집 - 주 1회만 실행 (브검/파워링크와 동일한 주차 키 기준)
  // 메타 브랜드 9개의 일상적인 순환 수집은 여기가 아니라 별도로 도는 metaBrandBatch.js
  // (Apify 아닌 순수 Playwright라 과금과 무관, 그래서 그쪽은 그대로 2시간마다 유지)가 전담
  const META_LAST_RUN_PATH = path.join(settings.dataDir, 'meta_last_run.json');
  const metaLastRun = fs.existsSync(META_LAST_RUN_PATH)
    ? JSON.parse(fs.readFileSync(META_LAST_RUN_PATH, 'utf-8'))
    : { weekKey: null };

  let metaRanThisTime = false;
  if (!forceMeta && metaLastRun.weekKey === currentWeekKey) {
    console.log(`\n[Meta] 이번 주(${currentWeekKey})에 이미 수집함 - 건너뜀`);
  } else {
    metaRanThisTime = true;
    // 핵심 단계(Apify 메타데이터 확보)가 실제로 성공했을 때만 "이번 주 완료"로 기록한다.
    // 예전엔 중간에 오류가 나도(catch로 삼켜지니까) 무조건 완료 기록을 남겨서, 진짜
    // 실패한 주에도 다음 실행에서 재시도가 안 되는 문제가 있었음.
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
    // 이 collect()가 아니라 별도로 2시간마다 도는 metaMediaBatch.js가 하루 내내 나눠서 채운다.
    // (페이스북 페이지를 한 세션에 몰아서 대량 방문하면 자동화 탐지 위험이 있어서, metaBrandBatch.js와
    // 같은 이유로 분리 - 한 번에 다 처리하지 않고 하루치 예산을 여러 번에 걸쳐 나눠 쓴다)
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

    // --force-meta로 돌린 테스트 실행은 "이번 주 정식 수집"으로 치지 않음 - 그래야
    // 원래 주기에 자동 수집이 게이트에 막히지 않고 그대로 진행됨
    if (forceMeta) {
      console.log('[Meta] --force-meta 테스트 실행이라 이번 주 완료 기록은 남기지 않음');
    } else if (metaSucceeded) {
      fs.writeFileSync(META_LAST_RUN_PATH, JSON.stringify({ weekKey: currentWeekKey, ranAt: new Date().toISOString() }), 'utf-8');
    } else {
      console.log('[Meta] Apify 단계 실패 - 이번 주 완료 기록 남기지 않음 (다음 실행에서 재시도)');
    }
  }

  // Google 수집 - 주 1회만 실행 (브검/파워링크와 동일한 주차 키 기준)
  const GOOGLE_LAST_RUN_PATH = path.join(settings.dataDir, 'google_last_run.json');
  const googleLastRun = fs.existsSync(GOOGLE_LAST_RUN_PATH)
    ? JSON.parse(fs.readFileSync(GOOGLE_LAST_RUN_PATH, 'utf-8'))
    : { weekKey: null };

  let googleRanThisTime = false;
  let googleNewCount = 0;
  if (!forceGoogle && googleLastRun.weekKey === currentWeekKey) {
    console.log(`\n[Google] 이번 주(${currentWeekKey})에 이미 수집함 - 건너뜀`);
  } else {
    googleRanThisTime = true;
    try {
      console.log('\n[Google] 수집 시작 (주 1회)');
      // 브랜드가 9개나 되고 광고주당 광고가 수백 건씩(많으면 1,000건 이상) 나와서 전체가
      // 몇 시간씩 걸릴 수 있음 - 예전엔 9개 브랜드를 다 돌아야 한 번에 저장해서, 중간에
      // 컴퓨터가 꺼지면 그때까지 처리한 것도 전부 날아갔다. 이제 브랜드 하나 끝날 때마다
      // 바로 processAndSaveItems로 저장해서, 끊겨도 그 지점까지는 안전하게 남는다.
      await scrapeGoogle(settings.keywords, settings.brands, settings, async (brand, brandItems) => {
        if (brandItems.length === 0) return;
        const { newItems: brandNewItems } = await processAndSaveItems(brandItems, settings);
        googleNewCount += brandNewItems.length;
        console.log(`[Google] "${brand}" 저장 완료 (신규 ${brandNewItems.length}개, 누적 ${googleNewCount}개)`);
      });
      if (!forceGoogle) {
        fs.writeFileSync(GOOGLE_LAST_RUN_PATH, JSON.stringify({ weekKey: currentWeekKey, ranAt: new Date().toISOString() }), 'utf-8');
      } else {
        console.log('[Google] --force-google 테스트 실행이라 이번 주 완료 기록은 남기지 않음');
      }
    } catch (e) { console.error('[Google] 오류:', e.message); }
  }

  // 구글은 브랜드별로 이미 위에서 바로바로 저장 완료됨 - 여기서는 메타(+기존 키워드 스크래퍼)만 처리
  console.log('\n총 수집(중복제거 전, 메타만): ' + allRaw.length + '개');

  const { newItems, finalIndex, newAds, endedAds } = await processAndSaveItems(allRaw, settings);
  console.log('신규 항목(중복 제외): ' + newItems.length + '개');
  console.log('신규 광고: ' + newAds.length + '개, 종료 광고: ' + endedAds.length + '개');
  if (googleRanThisTime) console.log('구글 신규(중복 제외, 브랜드별 누적): ' + googleNewCount + '개');

  // 실제로 이번에 수집을 시도한 매체만 상태 기록 (건너뛴 매체는 마지막 수집 시각을 그대로 둠).
  // 메타는 adId 중복 제거 전/후 숫자가 헷갈릴 수 있어서(같은 광고가 여러 검색어에 걸리는 등)
  // "중복 제외 후 실제 신규 저장 건수"를 명확히 기록해둔다.
  if (metaRanThisTime) {
    const metaNewCount = newItems.filter(i => i.platform === 'meta').length;
    updateCollectionStatus(settings.dataDir, 'meta', { lastCollectedAt: new Date().toISOString(), newCount: metaNewCount });
  }
  if (googleRanThisTime) {
    updateCollectionStatus(settings.dataDir, 'google', { lastCollectedAt: new Date().toISOString(), newCount: googleNewCount });
  }

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
  saveIndex(BS_INDEX_PATH, updatedBsIndex);
  if (bsRanThisTime) {
    updateCollectionStatus(settings.dataDir, 'brandsearch', { lastCollectedAt: new Date().toISOString(), newCount: newBsItems.length });
  }

  // 네이버 파워링크 모니터링 수집 - 주 1회만 실행 (키워드마다 PC/MO 15개씩 이미지까지
  // 다운로드하는 작업이라 매일 돌릴 필요 없음)
  let newPwlItems = [];
  let pwlRanThisTime = false;
  try {
    const existingPwlWeekKeys = new Set(
      existingPwlIndex.map(i => `${i.keyword}_${i.device}_${getMonthWeekKey(i.collectedAt)}`)
    );
    const keywordsNeedingCollection = forcePwl ? (settings.powerlinkKeywords || []).slice() : (settings.powerlinkKeywords || []).filter(keyword =>
      ['pc', 'mo'].some(device => !existingPwlWeekKeys.has(`${keyword}_${device}_${currentWeekKey}`))
    );

    if (keywordsNeedingCollection.length === 0) {
      console.log(`\n[네이버 파워링크] 이번 주(${currentWeekKey})에 전체 키워드 이미 수집함 - 건너뜀`);
    } else {
      pwlRanThisTime = true;
      console.log('\n[네이버 파워링크] 수집 시작 (주 1회, 대상: ' + keywordsNeedingCollection.join(', ') + ')');
      const pwlResults = await scrapeNaverPowerlink(keywordsNeedingCollection, settings.outputDir);
      const rawPwlItems = pwlResults.filter(Boolean);

      newPwlItems = rawPwlItems.filter(item => {
        const key = `${item.keyword}_${item.device}_${currentWeekKey}`;
        if (!forcePwl && existingPwlWeekKeys.has(key)) {
          console.log(`[파워링크 중복 스킵] ${item.keyword} ${item.device} (이번 주 이미 수집됨)`);
          return false;
        }
        return true;
      });

      console.log('[네이버 파워링크] ' + newPwlItems.length + '개 수집 (중복 ' + (rawPwlItems.length - newPwlItems.length) + '개 제외)');
    }
  } catch (e) { console.error('[네이버 파워링크] 오류:', e.message); }

  // --force-pwl도 브검과 동일하게 덧붙이기가 아니라 덮어쓰기로 처리
  const newPwlKeys = new Set(newPwlItems.map(i => `${i.keyword}_${i.device}_${currentWeekKey}`));
  const keptExistingPwlIndex = forcePwl
    ? existingPwlIndex.filter(i => !newPwlKeys.has(`${i.keyword}_${i.device}_${getMonthWeekKey(i.collectedAt)}`))
    : existingPwlIndex;
  const updatedPwlIndex = [...keptExistingPwlIndex, ...newPwlItems];
  saveIndex(PWL_INDEX_PATH, updatedPwlIndex);
  if (pwlRanThisTime) {
    updateCollectionStatus(settings.dataDir, 'powerlink', { lastCollectedAt: new Date().toISOString(), newCount: newPwlItems.length });
  }

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
