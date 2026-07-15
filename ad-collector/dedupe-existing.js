/**
 * 기존 데이터에서 중복 항목 정리 스크립트
 * fbcdn URL의 변동 토큰을 제거하고 동일 영상/이미지를 찾아 제거
 * 실행: node dedupe-existing.js
 */

const fs = require('fs');
const path = require('path');
const settings = require('./settings.json');

const INDEX_PATH = path.join(settings.dataDir, 'index.json');

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch (_) {
    return url.split('?')[0];
  }
}

function dedupe() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.log('index.json이 없습니다.');
    return;
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  console.log(`기존 항목: ${index.length}개`);

  const seen = new Set();
  const deduped = [];
  const removedFiles = [];

  for (const item of index) {
    const key = normalizeUrl(item.mediaUrl || item.thumbnailUrl);
    if (!key) {
      deduped.push(item); // URL 없는 항목은 일단 유지
      continue;
    }
    if (seen.has(key)) {
      // 중복 발견 - 로컬 파일 삭제 대상으로 기록
      if (item.localPath) removedFiles.push(path.join(settings.outputDir, item.localPath));
      if (item.localThumb) removedFiles.push(path.join(settings.outputDir, item.localThumb));
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  const removedCount = index.length - deduped.length;
  console.log(`중복 제거: ${removedCount}개`);
  console.log(`남은 항목: ${deduped.length}개`);

  // 백업 먼저
  fs.writeFileSync(INDEX_PATH + '.backup', JSON.stringify(index, null, 2), 'utf-8');
  console.log('백업 저장: data/index.json.backup');

  // 정리된 데이터 저장
  fs.writeFileSync(INDEX_PATH, JSON.stringify(deduped, null, 2), 'utf-8');
  console.log('정리 완료: data/index.json 업데이트됨');

  // 중복 파일 삭제
  let deletedFileCount = 0;
  removedFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        deletedFileCount++;
      } catch (_) {}
    }
  });
  console.log(`삭제된 파일: ${deletedFileCount}개`);

  // HTML 뷰어 재생성
  try {
    const { generateSite } = require('./generateSite');
    generateSite(deduped, settings);
    console.log('HTML 페이지 재생성 완료');
  } catch (e) {
    console.log('HTML 재생성 실패 (수동으로 npm run collect 실행 필요):', e.message);
  }
}

dedupe();
