/**
 * 유틸리티 함수들
 * - 이미지 다운로드
 * - pHash 기반 중복 판정
 * - 인덱스 저장/불러오기
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

/**
 * pHash(Perceptual Hash) 계산
 * 이미지를 32x32 그레이스케일로 줄인 뒤 평균 밝기 기준으로 64비트 해시 생성
 */
async function computePHash(imagePath) {
  try {
    const image = await Jimp.read(imagePath);
    image.resize({ w: 32, h: 32 }).greyscale();
    const pixels = [];
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const pixel = image.getPixelColor(x, y);
        const r = (pixel >> 24) & 0xff;
        pixels.push(r);
      }
    }
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    return pixels.map(p => (p >= avg ? '1' : '0')).join('');
  } catch (err) {
    return null;
  }
}

/**
 * 다운로드한 이미지의 실제 픽셀 크기 확인. null이면 읽기 실패(손상된 파일 등).
 * 프로필 사진/트래킹 픽셀처럼 광고 소재가 아닌 작은 이미지를 걸러낼 때 사용
 * (URL 패턴만으로는 못 걸러내는 경우의 최종 방어선).
 */
async function getImageDimensions(imagePath) {
  try {
    const image = await Jimp.read(imagePath);
    return { width: image.bitmap.width, height: image.bitmap.height };
  } catch (err) {
    return null;
  }
}

/**
 * 해밍 거리 계산 (두 해시가 얼마나 비슷한지)
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

/**
 * 기존 해시 목록과 비교해서 중복 여부 판정
 */
function isDuplicate(newHash, existingHashes, threshold = 10) {
  if (!newHash) return false;
  return existingHashes.some(h => hammingDistance(newHash, h) <= threshold);
}

/**
 * 이미지 URL 다운로드
 */
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return reject(new Error('Invalid URL'));
    }
    const proto = url.startsWith('https://') ? https : http;
    const file = fs.createWriteStream(destPath);
    const request = proto.get(url, { timeout: 15000 }, response => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlink(destPath, () => {});
        return downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    request.on('error', err => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * 데이터 인덱스 불러오기 (없으면 빈 배열)
 */
function loadIndex(indexPath) {
  try {
    if (fs.existsSync(indexPath)) {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
  } catch (_) {}
  return [];
}

/**
 * 데이터 인덱스 저장
 */
function saveIndex(indexPath, data) {
  fs.writeFileSync(indexPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 각 수집 종류(메타/구글/브랜드검색/파워링크/메타미디어보완 등)별 마지막 수집 시각과
 * 결과 건수를 data/collection_status.json에 기록. 백그라운드로 자동 실행되다 보니
 * 사람이 콘솔 로그를 직접 볼 일이 없어서, 대시보드 홈 화면에서 "언제/몇 건" 확인 가능하도록
 * 이 파일을 따로 남겨둔다.
 */
function updateCollectionStatus(dataDir, key, data) {
  const statusPath = path.join(dataDir, 'collection_status.json');
  let status = {};
  try {
    if (fs.existsSync(statusPath)) status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
  } catch (_) {}
  status[key] = { ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf-8');
}

/**
 * 파일명 안전하게 변환
 */
function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9가-힣_\-]/g, '_').slice(0, 50);
}

/**
 * 구조화된 파일명 생성
 * 형식: {매체}_{키워드}_{날짜}_{고유값}.{확장자}
 * 예시: meta_증권_20250629_abc12.jpg
 */
function buildFilename(platform, keyword, mediaType, ext) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const unique = Math.random().toString(36).slice(2, 7);
  const safeKeyword = (keyword || 'unknown').replace(/[^a-zA-Z0-9가-힣]/g, '_').slice(0, 20);
  const extension = ext || (mediaType === 'video' ? 'mp4' : 'jpg');
  return `${platform}_${safeKeyword}_${date}_${unique}.${extension}`;
}

/**
 * "년-월-몇째주" 키 계산 (예: 2026-08-W1). 브랜드검색/파워링크를 주 1회로
 * 제한할 때의 중복판정 기준이자, 화면에서 월/주차 캘린더로 보여줄 때 쓰는 키.
 * 주차는 달력상 절대 주(일~토)가 아니라 "그 달의 며칠째 주"로 단순 계산한다
 * (일반적으로 쓰는 "이번달 n주차" 감각과 맞춤).
 */
function getMonthWeekKey(dateInput) {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const weekOfMonth = Math.ceil(d.getDate() / 7);
  return `${year}-${month}-W${weekOfMonth}`;
}

module.exports = {
  computePHash,
  getImageDimensions,
  hammingDistance,
  isDuplicate,
  downloadImage,
  loadIndex,
  saveIndex,
  sanitizeFilename,
  buildFilename,
  updateCollectionStatus,
  getMonthWeekKey,
};
