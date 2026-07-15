/**
 * index.json에서 비금융 광고주 데이터 정리
 * node clean-index.js 로 실행
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, 'data', 'index.json');
const BACKUP_PATH = path.join(__dirname, 'data', 'index.backup.json');

const allowedPatterns = [
  '증권', '은행', '금융', '투자', '자산', '보험', '카드',
  '카카오뱅크', '카카오페이', '토스', '뱅크',
  '키움', '미래에셋', '삼성', 'NH', 'KB', '신한', '하나', '우리', 'SK',
  '한국투자', '대신', '교보', '흥국', '메리츠', '현대',
  '이베스트', '유안타', '하이투자', '부국', '케이프',
].map(p => p.toLowerCase());

function isFinancial(advertiserName) {
  if (!advertiserName) return false;
  const name = advertiserName.toLowerCase();
  return allowedPatterns.some(p => name.includes(p));
}

const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
console.log(`총 ${index.length}개 항목`);

const before = index.length;

const cleaned = index.filter(item => {
  // 브랜드 검색으로 수집된 건 그대로 유지
  if (item.searchType === 'brand') return true;
  // naver_bs도 그대로 유지
  if (item.platform === 'naver_bs') return true;
  // 키워드 검색: 광고주명이 금융 관련인 것만 유지
  return isFinancial(item.advertiserName);
});

const removed = before - cleaned.length;

// 백업 먼저
fs.copyFileSync(INDEX_PATH, BACKUP_PATH);
console.log(`백업 저장: ${BACKUP_PATH}`);

fs.writeFileSync(INDEX_PATH, JSON.stringify(cleaned, null, 2), 'utf-8');
console.log(`정리 완료: ${removed}개 제거 → 남은 항목 ${cleaned.length}개`);

// 제거된 항목 광고주 목록 출력
const removedItems = index.filter(item => !cleaned.includes(item));
const removedNames = [...new Set(removedItems.map(i => i.advertiserName).filter(Boolean))];
console.log(`\n제거된 광고주들:`);
removedNames.forEach(n => console.log(`  - ${n}`));
