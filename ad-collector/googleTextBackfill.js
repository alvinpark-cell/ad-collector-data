/**
 * 구글 이미지 광고 OCR 백필 - 구글 광고 투명성 센터는 이미지형 소재에 카피 텍스트를
 * 전혀 안 주기 때문에(copyText/headline 항상 빈 문자열), 로컬에 받아둔 이미지 파일을
 * Claude가 직접 열어서 안에 있는 문구를 읽어 copyText에 영구 저장해둔다. 한 번 채워두면
 * 소재 인사이트가 매번 이미지 6장만 보는 대신 실제 텍스트 전체를 기반으로 생성된다.
 *
 * 텍스트가 전혀 없는 이미지는 copyText에 "텍스트없음"을 저장해서 - 빈 문자열이 아니므로
 * 다음 실행에서 대상 필터(!copyText)에 다시 걸리지 않고 넘어간다(한 번 확인한 건 또
 * 처리하지 않기 위함).
 */

const fs = require('fs');
const path = require('path');
const { loadIndex, saveIndex } = require('./utils');
const { generateInsight } = require('./insightClient');

// 이미지 하나당 Claude 호출이 몇 초씩 걸려서 전체 실행이 오래 걸리는데, 그 사이 스케줄러의
// 다른 수집 작업이 같은 index.json에 새 항목을 추가할 수 있다. 시작할 때 읽어둔 스냅샷을
// 그대로 저장하면 그 사이 추가된 새 항목이 통째로 사라진다(실측: 다른 백필 스크립트가 이
// 패턴으로 신규 267건을 날린 사고 발생, 2026-08-06). 저장 시점마다 파일을 다시 읽어서,
// 지금까지 채운 copyText만 id 기준으로 최신 내용에 병합해 저장한다.
function saveTextMerged(indexPath, updatedItemsById) {
  const fresh = loadIndex(indexPath);
  fresh.forEach(item => {
    const update = updatedItemsById.get(item.id);
    if (update) item.copyText = update.copyText;
  });
  saveIndex(indexPath, fresh);
  return fresh;
}

const PROMPT = '첨부한 로컬 이미지 파일을 열어서 그 안에 있는 광고 카피/문구를 전부 그대로 옮겨 적어줘. ' +
  '설명이나 해석 없이 이미지에 실제로 적힌 텍스트만 답해. 이미지 안에 텍스트가 전혀 없으면 다른 말 없이 정확히 "텍스트없음"이라고만 답해.';

async function backfillGoogleImageText(settings, maxPerRun = Infinity) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const index = loadIndex(indexPath);
  const candidates = index.filter(i =>
    i.platform === 'google' && i.mediaType === 'image' &&
    !(i.copyText || '').trim() && !(i.headline || '').trim() &&
    i.localPath && !/^https?:\/\//i.test(i.localPath)
  );
  const targets = candidates.slice(0, maxPerRun);

  console.log(`[구글 OCR 백필] 대상 ${candidates.length}건 중 이번 실행에서 ${targets.length}건 시도`);

  let success = 0, empty = 0, fail = 0;
  const updatedItemsById = new Map();
  for (let n = 0; n < targets.length; n++) {
    const item = targets[n];
    const fullPath = path.join(settings.outputDir, item.localPath);
    if (!fs.existsSync(fullPath)) { fail++; continue; }

    try {
      const text = await generateInsight(`${PROMPT}\n\n이미지 경로: ${fullPath}`, null);
      const trimmed = text.trim();
      const copyText = trimmed || '텍스트없음';
      updatedItemsById.set(item.id, { copyText });
      if (trimmed === '텍스트없음' || !trimmed) empty++; else success++;
    } catch (e) {
      fail++;
      console.log(`  [실패] ${item.id}: ${e.message}`);
    }

    if ((n + 1) % 20 === 0) {
      saveTextMerged(indexPath, updatedItemsById);
      console.log(`  ...진행 ${n + 1}/${targets.length} (중간 저장 완료)`);
    }
  }

  saveTextMerged(indexPath, updatedItemsById);
  console.log(`[구글 OCR 백필] 완료 - 텍스트 추출 ${success}건, 텍스트없음 ${empty}건, 실패 ${fail}건 (남은 대상: ${candidates.length - targets.length}건)`);
  return { success, empty, fail, remaining: candidates.length - targets.length };
}

module.exports = { backfillGoogleImageText };
if (require.main === module) {
  const settings = require('./settings.json');
  const maxArg = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  backfillGoogleImageText(settings, maxArg).catch(err => { console.error('오류:', err); process.exit(1); });
}
