/**
 * 이미 저장된 구글 이미지 소재에 시각적 유사도 해시(visualHash)를 채워 넣는다.
 * 데이터를 지우지 않는다 - 대시보드의 "비슷하게 보이는 소재 접기" 표시용 필터가 쓸
 * 그룹핑 정보만 추가한다. 로컬에 이미 받아둔 파일로 계산하므로 재다운로드 없음.
 */

const fs = require('fs');
const path = require('path');
const { loadIndex, saveIndex, computePHash } = require('./utils');

function saveVisualHashMerged(indexPath, updatedItemsById) {
  const fresh = loadIndex(indexPath);
  fresh.forEach(item => {
    const update = updatedItemsById.get(item.id);
    if (update) item.visualHash = update.visualHash;
  });
  saveIndex(indexPath, fresh);
  return fresh;
}

async function backfillVisualHash(settings, maxPerRun = Infinity) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const index = loadIndex(indexPath);

  const candidates = index.filter(i =>
    i.platform === 'google' && i.mediaType === 'image' && !i.visualHash &&
    i.localPath && !/^https?:\/\//i.test(i.localPath)
  );
  const targets = candidates.slice(0, maxPerRun);
  console.log(`[구글 시각해시 백필] 대상 ${candidates.length}건 중 이번 실행에서 ${targets.length}건 시도`);
  if (targets.length === 0) return { success: 0, fail: 0, remaining: 0 };

  let success = 0, fail = 0;
  const updatedItemsById = new Map();

  for (let n = 0; n < targets.length; n++) {
    const item = targets[n];
    const fullPath = path.join(settings.outputDir, item.localPath);
    if (!fs.existsSync(fullPath)) { fail++; continue; }

    try {
      const hash = await computePHash(fullPath);
      if (hash) {
        updatedItemsById.set(item.id, { visualHash: hash });
        success++;
      } else {
        fail++;
      }
    } catch (e) {
      fail++;
      console.log(`  [실패] ${item.id}: ${e.message}`);
    }

    if ((n + 1) % 100 === 0) {
      saveVisualHashMerged(indexPath, updatedItemsById);
      console.log(`  ...진행 ${n + 1}/${targets.length} (중간 저장 완료)`);
    }
  }

  saveVisualHashMerged(indexPath, updatedItemsById);
  console.log(`[구글 시각해시 백필] 완료 - 성공 ${success}건, 실패 ${fail}건 (남은 대상: ${candidates.length - targets.length}건)`);
  return { success, fail, remaining: candidates.length - targets.length };
}

module.exports = { backfillVisualHash };
if (require.main === module) {
  const settings = require('./settings.json');
  const maxArg = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  backfillVisualHash(settings, maxArg).catch(err => { console.error('오류:', err); process.exit(1); });
}
