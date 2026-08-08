/**
 * 스케줄러
 *
 * 실행 방법: node scheduler.js
 * (컴퓨터가 켜져 있는 동안 계속 실행되어야 합니다)
 */

const cron = require('node-cron');
const { collect, runWeeklyMeta, runWeeklyGoogle, runWeeklyPowerlink } = require('./collector');
const { runNextBrandBatch } = require('./metaBrandBatch');
const { runMetaMediaBatch } = require('./metaMediaBatch');
const { updateMarketIndex } = require('./scrapers/marketIndex');
const { updateTrendReport } = require('./scrapers/trendReport');
const { updateCommunityTrend } = require('./scrapers/communityTrend');
const { backfillMissingImages } = require('./googleMediaBackfill');
const { backfillGoogleImageText } = require('./googleTextBackfill');
const { backfillLastShown } = require('./googleLastShownBackfill');
const { backfillNoDateFallback } = require('./noDateFallbackBackfill');
const { isHoliday } = require('./holidays');
const { isFirstBusinessDayOfWeek } = require('./scheduleUtils');
const settings = require('./settings.json');

console.log('📅 스케줄러 시작');
console.log('   메타(Apify+키워드)/구글은 매일 오전 11시에 "이번 주 첫 평일(공휴일 제외)"인지');
console.log('   확인해서 주 1회만 실행됩니다 (공휴일이 겹치면 자동으로 다음 평일로 밀림).');
console.log('   검색광고 일반키워드(파워링크)는 월/수/금 오전 11시, 그날이 공휴일이면 건너뜁니다.');
console.log('   브랜드검색/검색광고 브랜드키워드는 평일 오후 1시에 주 1회 실행됩니다.');
console.log('   메타 브랜드 9개는 2시간마다(짝수 시) 3개씩 나눠서 순환 수집됩니다 (IP 차단 방지).');
console.log('   메타 광고 이미지/영상은 2시간마다(홀수 시) 조금씩 채워집니다 (IP 차단 방지).');
console.log('   코스피/코스닥/나스닥 지수는 매일 오전 9시에 갱신됩니다.');
console.log('   트렌드 리포트(구글 시트)는 매일 오전 9시 30분에 다시 받아옵니다.');
console.log('   지금 바로 실행하려면: node collector.js\n');

// cron 표현식: 초 분 시 일 월 요일

// 메타(Apify+키워드)/구글 - 주 1회, 이번 주 첫 평일(공휴일 제외)에만 실행.
// 크론 자체는 매일 11시에 돌지만, isFirstBusinessDayOfWeek()가 true인 날에만 실제로
// 수집한다 - 월요일이 공휴일이면 화요일로, 추석처럼 월~수가 다 공휴일이면 목요일로
// 자동으로 밀린다. Apify는 호출당 비용이 드는 유료 API라 주 1회 이상 늘리지 않는다.
cron.schedule('0 0 11 * * *', async () => {
  const now = new Date();
  if (!isFirstBusinessDayOfWeek(now)) {
    console.log(`\n⏰ [메타/구글] ${now.toLocaleDateString('ko-KR')}는 이번 주 실행일이 아님 - 건너뜀`);
    return;
  }
  console.log(`\n⏰ 메타/구글 주간 수집 실행: ${now.toLocaleString('ko-KR')}`);
  try {
    await Promise.all([runWeeklyMeta(settings), runWeeklyGoogle(settings)]);
  } catch (err) {
    console.error('메타/구글 수집 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 검색광고 일반키워드(네이버 파워링크) - 월/수/금 오전 11시. 이미 주 3회라 공휴일이어도
// 대체일을 만들지 않고 그날만 건너뛴다(메타/구글과 달리 한 번 놓쳐도 그 주 안에 또 돈다).
cron.schedule('0 0 11 * * 1,3,5', async () => {
  const now = new Date();
  if (isHoliday(now)) {
    console.log(`\n⏰ [파워링크] ${now.toLocaleDateString('ko-KR')}는 공휴일 - 건너뜀`);
    return;
  }
  console.log(`\n⏰ 파워링크(일반키워드) 수집 실행: ${now.toLocaleString('ko-KR')}`);
  try {
    await runWeeklyPowerlink(settings);
  } catch (err) {
    console.error('파워링크 수집 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 브랜드검색 + 검색광고 브랜드키워드 - 평일 오후 1시, 주 1회("이번 주에 이미 했는지" 게이트는
// collect() 내부에서 처리). '0 0 13 * * 1-5' = 매주 월~금 13:00:00
cron.schedule('0 0 13 * * 1-5', async () => {
  console.log(`\n⏰ 스케줄 실행: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await collect();
  } catch (err) {
    console.error('수집 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 메타 브랜드 배치: 2시간마다 3개씩만 순환 수집.
// 9개를 한 번에 몰아서 때리면 Facebook 자동화 탐지에 걸릴 위험이 있어서
// 시간을 두고 나눠 보낸다 ('0 */2 * * *' = 매 짝수 시 정각).
cron.schedule('0 */2 * * *', async () => {
  console.log(`\n⏰ 브랜드 배치 실행: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await runNextBrandBatch(settings);
  } catch (err) {
    console.error('브랜드 배치 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 메타 광고 이미지/영상 채우기: 2시간마다 조금씩(홀수 시).
// 브랜드 배치(짝수 시)와 겹치지 않게 offset을 둬서, 같은 시각에 페이스북에
// 동시에 두 세션이 몰리지 않도록 함 ('0 1-23/2 * * *' = 1,3,5...23시 정각).
cron.schedule('0 1-23/2 * * *', async () => {
  console.log(`\n⏰ 메타 미디어 배치 실행: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await runMetaMediaBatch();
  } catch (err) {
    console.error('메타 미디어 배치 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 코스피/코스닥/나스닥 지수: 매일 오전 9시(장 시작 무렵) 갱신
cron.schedule('0 0 9 * * *', async () => {
  console.log(`\n⏰ 시장지수 갱신: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await updateMarketIndex(settings);
  } catch (err) {
    console.error('시장지수 갱신 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 트렌드 리포트(구글 시트 - 앱별 MAU/신규설치): 매일 오전 9시 30분 갱신.
// 팀에서 시트를 수정하면 다음 이 시각에 자동으로 다시 받아온다.
cron.schedule('0 30 9 * * *', async () => {
  console.log(`\n⏰ 트렌드 리포트 갱신: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await updateTrendReport(settings);
  } catch (err) {
    console.error('트렌드 리포트 갱신 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 커뮤니티 반응(화제 키워드 + 감정분류 + 실제 반응): 매일 오전 8시 갱신 - 캘린더로
// 과거 날짜를 조회하고 전일比/7일 추이 스파크라인을 보여주려면 매일 기록이 쌓여야 함.
cron.schedule('0 0 8 * * *', async () => {
  console.log(`\n⏰ 커뮤니티 반응 갱신: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await updateCommunityTrend(settings);
  } catch (err) {
    console.error('커뮤니티 반응 갱신 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 구글 이미지 다운로드 실패 복구: 최초 수집 시 다운로드가 실패해(레이트리밋 추정)
// mediaUrl만 있고 로컬 파일이 없는 항목을 매일 다시 시도한다 - 이 mediaUrl(구글 CDN
// 링크)은 언젠가 만료될 수 있어서 실패한 채로 오래 두면 안 됨.
cron.schedule('0 0 7 * * *', async () => {
  console.log(`\n⏰ 구글 이미지 백필 실행: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await backfillMissingImages(settings);
  } catch (err) {
    console.error('구글 이미지 백필 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 구글 이미지 광고 OCR 텍스트 백필: 하루 200건씩 - 위 이미지 백필 다음에 실행해서
// 그날 새로 복구된 이미지도 바로 텍스트 추출 대상에 포함되게 한다.
cron.schedule('0 30 7 * * *', async () => {
  console.log(`\n⏰ 구글 OCR 백필 실행: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await backfillGoogleImageText(settings, 200);
  } catch (err) {
    console.error('구글 OCR 백필 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 구글 광고 마지막 게재일 백필: 수집 시점엔 게재 중이라 값이 없다가, 이후 종료
// 처리(status: 'ended')된 광고를 상세페이지에서 다시 확인해 정확한 값을 채운다.
cron.schedule('0 45 7 * * *', async () => {
  console.log(`\n⏰ 구글 게재일 백필 실행: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await backfillLastShown(settings);
  } catch (err) {
    console.error('구글 게재일 백필 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 날짜 정보 전혀 없는 구글 종료 소재(adStartedAt/adLastShownAt 둘 다 없음)에 2025-01-01
// 추정치 채우기: 위 게재일 백필(07:45)이 그날 새로 종료 처리된 것 중 일부를 못 채우고
// 넘어가면, 그 나머지가 대시보드 "최신순"에서 수집일 때문에 맨 위로 뜨는 문제가 있었다
// (2026-08-08 확인). 게재일 백필 다음에 돌려서 그 결과를 반영한 나머지만 대상으로 한다.
cron.schedule('0 50 7 * * *', async () => {
  console.log(`\n⏰ 날짜없음 소재 추정치 백필 실행: ${new Date().toLocaleString('ko-KR')}`);
  try {
    backfillNoDateFallback(settings);
  } catch (err) {
    console.error('날짜없음 소재 백필 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 프로세스가 종료되지 않도록 유지
process.on('SIGINT', () => {
  console.log('\n👋 스케줄러 종료');
  process.exit(0);
});
