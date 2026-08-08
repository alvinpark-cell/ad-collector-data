/**
 * 구글 광고 이미지 재다운로드 백필 - processItems.js가 최초 수집 시점에 이미지 다운로드에
 * 실패해서 localPath: null로 남은 항목들을 다시 시도한다.
 *
 * 발견 경위: 메리츠증권만 1,043건(전체 구글 이미지 광고의 상당수)이 localPath가 없이
 * mediaUrl(구글 CDN 링크)만 저장된 상태였다. 원인은 링크 만료가 아니라 최초 수집 시
 * 짧은 시간에 이미지를 대량으로 연속 다운로드하면서 발생한 일시적 실패(레이트리밋 추정)
 * 로 확인됨 - 실패했던 URL 하나를 지금 다시 받아보니 정상 성공함. 이 mediaUrl(구글
 * 광고 투명성 센터의 CDN 링크)은 언젠가 만료될 수 있으므로, 만료되기 전에 최대한
 * 로컬(또는 S3)에 실물 파일로 영구 보관해두는 것이 이 스크립트의 목적이다.
 *
 * 최초 수집 때와 달리 이미 index.json에 개별 광고 항목으로 확정된 것들이라, 여기서는
 * pHash 중복제거를 다시 하지 않는다 - 그건 신규 발견 시점에만 하는 일이고, 지금은
 * "이미 존재하기로 확정된 항목의 미디어 실물을 못 받았으니 다시 받는다"일 뿐이다.
 */

const fs = require('fs');
const path = require('path');
const { downloadImage, loadIndex, saveIndex, buildFilename } = require('./utils');
const { uploadIfEnabled } = require('./storage');

// 이미지 다운로드가 건당 시간이 걸려서 전체 실행이 오래 걸리는데, 그 사이 스케줄러의 다른
// 수집 작업이 같은 index.json에 새 항목을 추가할 수 있다. 시작할 때 읽어둔 스냅샷을 그대로
// 저장하면 그 사이 추가된 새 항목이 통째로 사라진다(실측: 다른 백필 스크립트가 이 패턴으로
// 신규 267건을 날린 사고 발생, 2026-08-06). 저장 시점마다 파일을 다시 읽어서, 지금까지
// 받은 localPath만 id 기준으로 최신 내용에 병합해 저장한다.
function saveMediaMerged(indexPath, updatedItemsById) {
  const fresh = loadIndex(indexPath);
  fresh.forEach(item => {
    const update = updatedItemsById.get(item.id);
    if (update) item.localPath = update.localPath;
  });
  saveIndex(indexPath, fresh);
  return fresh;
}

async function backfillMissingImages(settings, maxPerRun = Infinity) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const index = loadIndex(indexPath);
  const candidates = index.filter(i => i.mediaType === 'image' && i.mediaUrl && !i.localPath);
  const targets = candidates.slice(0, maxPerRun);

  console.log(`[구글 이미지 백필] 대상 ${candidates.length}건 중 이번 실행에서 ${targets.length}건 시도`);

  let success = 0, fail = 0;
  const updatedItemsById = new Map();
  for (let n = 0; n < targets.length; n++) {
    const item = targets[n];
    const filename = buildFilename(item.platform, item.keyword, 'image', 'jpg');
    const imagePath = path.join(settings.outputDir, 'images', item.platform, filename);
    try {
      await downloadImage(item.mediaUrl, imagePath);
      let localPath = ['images', item.platform, filename].join('/');
      localPath = await uploadIfEnabled(settings.outputDir, localPath);
      updatedItemsById.set(item.id, { localPath });
      success++;
    } catch (e) {
      fail++;
      console.log(`  [실패] ${item.id}: ${e.message}`);
    }
    // 중간에 프로세스가 죽어도 여기까지 받은 건 안전하게 남도록 20건마다 저장
    // (예전엔 전체 루프가 끝나야만 한 번 저장해서, 도중에 죽으면 진행분이 전부 날아갔음)
    if ((n + 1) % 20 === 0) {
      saveMediaMerged(indexPath, updatedItemsById);
      console.log(`  ...진행 ${n + 1}/${targets.length} (중간 저장 완료)`);
    }
    // 최초 수집 실패 원인으로 추정되는 레이트리밋을 다시 겪지 않도록 요청 사이 간격을 둔다
    await new Promise(r => setTimeout(r, 600));
  }

  saveMediaMerged(indexPath, updatedItemsById);
  console.log(`[구글 이미지 백필] 완료 - 성공 ${success}건, 실패 ${fail}건 (남은 대상: ${candidates.length - targets.length}건)`);
  return { success, fail, remaining: candidates.length - targets.length };
}

module.exports = { backfillMissingImages };
if (require.main === module) {
  const settings = require('./settings.json');
  const maxArg = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  backfillMissingImages(settings, maxArg).catch(err => { console.error('오류:', err); process.exit(1); });
}
