/**
 * 구글 종료 소재 중 adStartedAt/adLastShownAt이 둘 다 없는 것들(상세페이지가 더 이상 마지막
 * 게재일을 보여주지 않는 오래된 광고, 실측상 구글 종료 소재의 약 48%)은 대시보드 정렬/연도분류에서
 * "수집일"로 대체되어 최근 백필 시점(2026-08)에 재발견됐다는 이유만으로 최신순 맨 위에
 * 뜨는 문제가 있었다(2026-08-08 확인). 정확한 날짜를 더 이상 구할 방법이 없어서(구글이
 * 이미 정보를 안 줌), 사용자 확인(메리츠증권 샘플 육안 확인 결과 2025년 소재)에 따라
 * adLastShownAt에 2025-01-01을 채워 넣는다 - 정확한 날짜는 아니지만 "적어도 2025년"이라는
 * 대략적인 분류만 가능하게 하는 자리표시자다.
 * (구글로만 한정: 메타는 같은 필드 없음 현상이라도 원인이 다르다 - 실측으로 확인한 메타
 * 사례는 광고 본문에 "2026.07~2026.09 이벤트"가 명시돼 있어서 실제로는 2026년 소재였다.
 * 메타는 adStartedAt 파싱 자체가 누락된 별개의 버그로 보이므로 여기서 같이 2025로 덮으면
 * 틀린 값을 넣게 된다.)
 */
const path = require('path');
const { loadIndex, saveIndex } = require('./utils');

const PLACEHOLDER_DATE = '2025-01-01';

function backfillNoDateFallback(settings) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const index = loadIndex(indexPath);
  let updated = 0;
  const updatedIndex = index.map(item => {
    if (item.platform === 'google' && !item.adStartedAt && !item.adLastShownAt) {
      updated++;
      return Object.assign({}, item, { adLastShownAt: PLACEHOLDER_DATE, adDateEstimated: true });
    }
    return item;
  });
  saveIndex(indexPath, updatedIndex);
  console.log(`[날짜없음 백필] ${updated}개 항목(구글)에 adLastShownAt=${PLACEHOLDER_DATE} (추정) 채움`);
  return updated;
}

module.exports = { backfillNoDateFallback };
if (require.main === module) {
  const settings = require('./settings.json');
  backfillNoDateFallback(settings);
}
