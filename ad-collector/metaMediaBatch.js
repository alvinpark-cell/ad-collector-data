/**
 * 메타 광고 이미지/영상 채우기 배치.
 *
 * collector.js(주 1회)가 Apify로 확보한 광고 메타데이터는 이미지/영상 URL이 없다 -
 * 실제 미디어를 받으려면 광고 하나하나 페이스북 광고 라이브러리 페이지를 Playwright로
 * 방문해야 하는데, 이걸 한 세션에 몰아서 대량으로 하면 자동화 탐지 위험이 있다
 * (metaBrandBatch.js가 브랜드 9개를 2시간마다 나눠서 도는 것과 똑같은 이유).
 *
 * 그래서 이 배치를 scheduler.js가 2시간마다 별도로 호출해서, 미디어 없이 저장된
 * "대기 중" 항목들을 하루 종일에 걸쳐 조금씩 채워 나간다. 이번 실행에서 못 채운 건
 * 다음 실행(2시간 뒤)에 그대로 이어서 처리되므로 유실되지 않는다.
 */

const path = require('path');
const settings = require('./settings.json');
const { loadIndex, updateCollectionStatus } = require('./utils');
const { backfillPendingMedia } = require('./scrapers/metaAdDetail');

async function runMetaMediaBatch() {
  const batchSize = settings.metaDetailMaxVisitsPerRun || 150; // 2시간마다 이만큼만 방문
  const indexPath = path.join(settings.dataDir, 'index.json');
  const existingIndex = loadIndex(indexPath);

  // backfillPendingMedia가 건마다 바로바로 저장하므로 여기서 따로 다시 저장할 필요 없음
  const { attempted, updated } = await backfillPendingMedia(existingIndex, settings, batchSize);
  console.log(`[메타 미디어 배치] ${attempted}건 시도, ${updated}건 미디어 채움`);

  // 이번 실행 뒤 다시 읽어서 아직 미디어 없는 건 몇 개나 남았는지 기록 (대시보드에서 진행 상황 확인용)
  const afterIndex = loadIndex(indexPath);
  const stillPending = afterIndex.filter(i => i.platform === 'meta' && i.adId && !i.mediaType).length;
  updateCollectionStatus(settings.dataDir, 'metaMediaBatch', {
    lastRunAt: new Date().toISOString(),
    attempted,
    updated,
    stillPending,
  });

  return { attempted, updated, stillPending };
}

module.exports = { runMetaMediaBatch };
if (require.main === module) {
  runMetaMediaBatch().catch(err => { console.error('오류:', err); process.exit(1); });
}
