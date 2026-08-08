/**
 * 구글 광고 중 문구(copyText/headline)가 아예 없는 소재 - 대부분 텍스트 오버레이 없이
 * 모델/제품 비주얼만 있는 이미지 광고 - 를 대상으로, 로컬에 받아둔 이미지를 Claude가
 * 직접 열어서 설명(문구뿐 아니라 모델/비주얼/분위기까지)을 생성해 item.aiDescription에
 * 채워 넣는다. 이게 있어야 소재 인사이트(creative-insight)가 "문구 없음" 소재도 분석에
 * 반영할 수 있다.
 *
 * S3 업로드된 항목(localPath가 http로 시작)은 로컬에 파일이 없어서 대상에서 제외한다.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const settings = require('./settings.json');
const { loadIndex, saveIndex } = require('./utils');

// 이 스크립트는 이미지 하나당 몇 초씩 걸려서 전체 실행이 오래 걸리는데, 그 사이에 스케줄러의
// 다른 수집 작업(2시간마다 도는 메타 배치 등)이 같은 index.json에 새 항목을 추가할 수 있다.
// 시작할 때 읽어둔 스냅샷을 그대로 저장하면 그 사이 추가된 새 항목이 통째로 사라진다(실측:
// 구글 백필과 동시에 돌려서 신규 267건이 날아간 사고 발생, 2026-08-06). 그래서 저장 시점마다
// 파일을 다시 읽어서, 지금까지 채운 aiDescription만 id 기준으로 그 최신 내용에 병합해 저장한다.
function saveDescriptionsMerged(indexPath, updatedItemsById) {
  const fresh = loadIndex(indexPath);
  fresh.forEach(item => {
    const update = updatedItemsById.get(item.id);
    if (update) item.aiDescription = update.aiDescription;
  });
  saveIndex(indexPath, fresh);
  return fresh;
}

const MIN_DELAY_MS = 800;
const DELAY_JITTER_MS = 500;

const PROMPT = '이 이미지는 증권사 경쟁사 구글 디스플레이 광고 소재야. 이미지 안에 있는 문구(있다면 그대로)뿐 아니라, ' +
  '모델/인물이 나오는지, 어떤 제품·상황·분위기를 보여주는지까지 한국어로 1~2문장으로 짧게 설명해줘. ' +
  '마크다운이나 따옴표 없이 평문으로만 답해.';

async function backfillDescriptions(maxPerRun = Infinity) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const index = loadIndex(indexPath);

  const candidates = index.filter(i =>
    i.platform === 'google' &&
    !((i.copyText || '').trim() || (i.headline || '').trim()) &&
    !i.aiDescription &&
    i.localPath && i.mediaType === 'image' && !/^https?:\/\//i.test(i.localPath)
  );
  const targets = candidates.slice(0, maxPerRun);

  console.log(`[구글 디스크립션 백필] 대상 ${candidates.length}건 중 이번 실행에서 ${targets.length}건 시도`);
  if (targets.length === 0) return { success: 0, fail: 0, remaining: 0 };

  let success = 0, fail = 0;
  const updatedItemsById = new Map();

  for (let n = 0; n < targets.length; n++) {
    const item = targets[n];
    const imagePath = path.join(settings.outputDir, item.localPath);
    if (!fs.existsSync(imagePath)) {
      fail++;
      console.log(`  [건너뜀-파일없음] ${item.id}`);
      continue;
    }

    try {
      const stdout = execFileSync('claude', ['-p', PROMPT + '\n\n이미지 경로: ' + imagePath, '--output-format', 'text'], {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 5,
        timeout: 60000,
      });
      const desc = stdout.trim();
      if (desc) {
        updatedItemsById.set(item.id, { aiDescription: desc });
        success++;
      } else {
        fail++;
        console.log(`  [빈 응답] ${item.id}`);
      }
    } catch (e) {
      fail++;
      const errObj = e;
      const detail = (errObj && errObj.stdout ? String(errObj.stdout).trim() : '') || (e.message || '').split('\n')[0];
      console.log(`  [실패] ${item.id}: ${detail}`);
    }

    if ((n + 1) % 10 === 0) {
      saveDescriptionsMerged(indexPath, updatedItemsById);
      console.log(`  ...진행 ${n + 1}/${targets.length} (중간 저장 완료, 성공 ${success} / 실패 ${fail})`);
    }

    const delay = MIN_DELAY_MS + Math.random() * DELAY_JITTER_MS;
    await new Promise(r => setTimeout(r, delay));
  }

  saveDescriptionsMerged(indexPath, updatedItemsById);
  console.log(`[구글 디스크립션 백필] 완료 - 성공 ${success}건, 실패 ${fail}건 (남은 대상: ${candidates.length - targets.length}건)`);
  return { success, fail, remaining: candidates.length - targets.length };
}

module.exports = { backfillDescriptions };
if (require.main === module) {
  const maxArg = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  backfillDescriptions(maxArg).catch(err => { console.error('오류:', err); process.exit(1); });
}
