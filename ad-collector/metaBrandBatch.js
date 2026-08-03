/**
 * 메타(Facebook) 브랜드 배치 순환 스크래퍼.
 *
 * 9개 브랜드를 한 번에 다 스크래핑하면 짧은 시간에 요청이 몰려서
 * Facebook 자동화 탐지에 걸릴 위험이 있다 (실제로 겪었던 문제).
 * 그래서 3개씩 3묶음으로 나눠서, scheduler.js가 2시간마다 이 모듈의
 * runNextBrandBatch()를 호출해 "이번 차례" 묶음 하나만 처리한다.
 * 몇 번째 묶음까지 돌았는지는 data/metaBatchState.json에 저장해서
 * 다음 실행 때 이어서 순환한다.
 *
 * collector.js(하루 1회 전체 수집)는 이제 브랜드는 안 건드리고 키워드만
 * scrapeMeta로 돌린다 — 브랜드는 이 배치가 전담.
 */

const fs = require('fs');
const path = require('path');
const { scrapeMeta } = require('./scrapers/meta');
const { processAndSaveItems } = require('./processItems');
const { generateSite } = require('./generateSite');

const BATCH_SIZE = 3;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function loadState(statePath) {
  try {
    if (fs.existsSync(statePath)) return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch (_) {}
  return { nextIndex: 0 };
}

function saveState(statePath, state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

async function runNextBrandBatch(settings) {
  if (!fs.existsSync(settings.dataDir)) fs.mkdirSync(settings.dataDir, { recursive: true });
  const statePath = path.join(settings.dataDir, 'metaBatchState.json');

  const batches = chunk(settings.brands || [], BATCH_SIZE);
  if (batches.length === 0) {
    console.log('[브랜드 배치] settings.brands가 비어있어 건너뜀');
    return;
  }

  const state = loadState(statePath);
  const idx = state.nextIndex % batches.length;
  const batch = batches[idx];

  console.log(`\n[브랜드 배치 ${idx + 1}/${batches.length}] 대상: ${batch.join(', ')}`);
  try {
    const results = await scrapeMeta([], batch, settings);
    console.log(`[브랜드 배치 ${idx + 1}/${batches.length}] ${results.length}개 수집`);

    const { newItems, finalIndex } = await processAndSaveItems(results, settings);
    console.log(`[브랜드 배치 ${idx + 1}/${batches.length}] 신규 저장: ${newItems.length}개`);

    generateSite(finalIndex, settings);
  } catch (err) {
    console.error(`[브랜드 배치 ${idx + 1}/${batches.length}] 오류:`, err.message);
  }

  saveState(statePath, { nextIndex: (idx + 1) % batches.length });
}

module.exports = { runNextBrandBatch };

if (require.main === module) {
  const settings = require('./settings.json');
  runNextBrandBatch(settings).catch(err => { console.error('오류:', err); process.exit(1); });
}
