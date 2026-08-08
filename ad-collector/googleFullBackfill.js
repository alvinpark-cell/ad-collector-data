/**
 * 구글 전체 재수집(백필) - 무한 스크롤 상한을 30회 -> 500회로 늘리고 "3번 연속 정지"
 * 판정으로 바꾼 수정(2026-08-05, google.js) 이후, 그동안 옛 30회 상한 때문에 누락됐던
 * 물량(삼성증권 등 광고 수가 많은 브랜드)을 다시 잡기 위한 1회성 전체 재수집.
 *
 * 브랜드 하나 끝날 때마다 바로 저장하고, 끝난 브랜드 이름을 진행 상황 파일
 * (data/google_backfill_progress.json)에 남긴다 - 인터넷이 끊기거나 컴퓨터를 꺼도
 * 이 스크립트를 그대로 다시 실행하면 이미 끝난 브랜드는 건너뛰고 안 끝난 브랜드부터
 * 이어서 돈다(다시 처음부터 돌고 싶으면 그 진행 상황 파일을 지우면 됨).
 */

const fs = require('fs');
const path = require('path');
const settings = require('./settings.json');
const { scrapeGoogle } = require('./scrapers/google');
const { processAndSaveItems } = require('./processItems');
const { generateSite } = require('./generateSite');
const { updateCollectionStatus } = require('./utils');

const PROGRESS_PATH = path.join(settings.dataDir, 'google_backfill_progress.json');

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_PATH)) return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
  } catch (_) {}
  return { done: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf-8');
}

async function run() {
  const progress = loadProgress();
  const doneSet = new Set(progress.done);
  const remainingAll = settings.brands.filter(b => !doneSet.has(b));

  if (remainingAll.length === 0) {
    console.log('[구글 전체 재수집] 이미 모든 브랜드 완료됨 - 처음부터 다시 돌리려면 이 파일을 지우세요:');
    console.log('  ' + PROGRESS_PATH);
    return;
  }

  // node googleFullBackfill.js 3 처럼 숫자를 넘기면 이번 실행에서 그만큼만 처리하고
  // 끝낸다(스크립트 자체가 종료됨 - 중간에 딱 원하는 지점에서 멈추고 싶을 때 사용).
  // 안 넘기면 남은 브랜드 전부를 한 번에 처리한다.
  const limitArg = parseInt(process.argv[2], 10);
  const remaining = Number.isFinite(limitArg) && limitArg > 0 ? remainingAll.slice(0, limitArg) : remainingAll;

  console.log(`[구글 전체 재수집] 총 ${settings.brands.length}개 중 ${doneSet.size}개 이미 완료, ${remainingAll.length}개 남음. 이번 실행 대상: ${remaining.join(', ')}`);

  let totalNew = 0;
  await scrapeGoogle([], remaining, settings, async (brand, brandItems) => {
    if (brandItems.length > 0) {
      const { newItems, finalIndex } = await processAndSaveItems(brandItems, settings);
      totalNew += newItems.length;
      console.log(`[구글 전체 재수집] "${brand}" 저장 완료 (신규 ${newItems.length}개, 전체 누적 신규 ${totalNew}개)`);
      generateSite(finalIndex, settings);
    } else {
      console.log(`[구글 전체 재수집] "${brand}" 신규 없음`);
    }

    doneSet.add(brand);
    progress.done = Array.from(doneSet);
    saveProgress(progress);
    console.log(`[구글 전체 재수집] "${brand}" 완료 기록 - 여기서 끊겨도 다음엔 이 지점부터 이어서 돕니다\n`);
  });

  updateCollectionStatus(settings.dataDir, 'google', { lastCollectedAt: new Date().toISOString(), newCount: totalNew });
  console.log(`[구글 전체 재수집] 전체 완료! 이번 실행 총 신규 ${totalNew}개`);
}

run().catch(err => { console.error('[구글 전체 재수집] 오류:', err.message); process.exit(1); });
