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
const { updateCompetitorTrendSheet } = require('./scrapers/competitorTrendSheet');
const { runCapture: runNaverPremiumCapture } = require('./scrapers/naverPremiumCapture');
const { updateYoutubeCompetitorTrend } = require('./scrapers/youtubeCompetitorTrend');
const { backfillMissingImages } = require('./googleMediaBackfill');
const { backfillGoogleImageText } = require('./googleTextBackfill');
const { backfillLastShown } = require('./googleLastShownBackfill');
const { backfillNoDateFallback } = require('./noDateFallbackBackfill');
const { backfillDescriptions } = require('./googleDescriptionBackfill');
const { isFirstBusinessDayOfWeek } = require('./scheduleUtils');
const settings = require('./settings.json');

console.log('📅 스케줄러 시작');
console.log('   메타/구글/검색광고 일반키워드/브랜드검색/검색광고 브랜드키워드는 전부 매일 오전 11시에');
console.log('   "이번 주 첫 평일(공휴일 제외)"인지 확인해서 주 1회만 실행됩니다(2026-08-10부터 시간 통일).');
console.log('   메타 브랜드 9개는 2시간마다(짝수 시) 3개씩 나눠서 순환 수집됩니다 (IP 차단 방지).');
console.log('   메타 광고 이미지/영상은 2시간마다(홀수 시) 조금씩 채워집니다 (IP 차단 방지).');
console.log('   코스피/코스닥/나스닥 지수, 커뮤니티 반응은 매일 오전 9시 30분에 갱신됩니다(전일자 기준).');
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

// 검색광고 일반키워드(네이버 파워링크) - 메타/구글과 동일하게 매일 11시에 "이번 주 첫
// 평일(공휴일 제외)"인지 확인해서 주 1회만 실행(2026-08-10: 예전엔 월/수/금 3회 크론에
// 공휴일이면 그냥 건너뛰는 방식이었는데, 시간대를 다른 주간 수집과 통일하고 재시도용
// 여러 요일 크론도 필요 없다고 판단해 메타/구글과 같은 방식으로 맞춤).
cron.schedule('0 0 11 * * *', async () => {
  const now = new Date();
  if (!isFirstBusinessDayOfWeek(now)) {
    console.log(`\n⏰ [파워링크 일반키워드] ${now.toLocaleDateString('ko-KR')}는 이번 주 실행일이 아님 - 건너뜀`);
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

// 브랜드검색 + 검색광고 브랜드키워드 - 메타/구글/일반키워드와 동일한 시각(오전 11시)에
// "이번 주 첫 평일"인지 확인해서 주 1회만 실행(2026-08-10: 예전엔 평일 오후 1시에 매일
// 돌면서 collect() 내부의 "이번 주에 이미 했는지" 개별 체크로 주 1회를 만들었는데, 다른
// 주간 수집들과 시각을 통일하고 같은 공휴일 인지 로직을 쓰도록 맞춤 - collect() 내부
// 체크는 그대로 남아있어도 무해한 안전장치라 손대지 않음).
cron.schedule('0 0 11 * * *', async () => {
  const now = new Date();
  if (!isFirstBusinessDayOfWeek(now)) {
    console.log(`\n⏰ [브랜드검색/브랜드키워드] ${now.toLocaleDateString('ko-KR')}는 이번 주 실행일이 아님 - 건너뜀`);
    return;
  }
  console.log(`\n⏰ 브랜드검색/브랜드키워드 수집 실행: ${now.toLocaleString('ko-KR')}`);
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

// 코스피/코스닥/나스닥 지수: 매일 오전 9시 30분 갱신(2026-08-10: 트렌드 리포트와 시각
// 통일 요청에 따라 09시→09시30분으로 변경. 지수 자체가 전일 종가 기준이라 "전일자"
// 데이터인 건 원래도 그랬음, 시각만 옮김).
cron.schedule('0 30 9 * * *', async () => {
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

// 커뮤니티 반응(화제 키워드 + 감정분류 + 실제 반응): 매일 오전 9시 30분 갱신(2026-08-10:
// 08시→09시30분으로 변경, 다른 "전일자" 수집들과 시각 통일). updateCommunityTrend() 내부에서
// yesterdayKey()로 전일자 스냅샷을 기록하므로 시각이 늦어져도 라벨링에는 문제 없음 - 캘린더로
// 과거 날짜를 조회하고 전일比/7일 추이 스파크라인을 보여주려면 매일 기록이 쌓여야 함.
cron.schedule('0 30 9 * * *', async () => {
  console.log(`\n⏰ 커뮤니티 반응 갱신: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await updateCommunityTrend(settings);
  } catch (err) {
    console.error('커뮤니티 반응 갱신 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 네이버 타임보드(PC)/스페셜DA(모바일) 캡처: 매 정시. 상품소개서 확인 결과(2026-08-13)
// 둘 다 1시간 단위 판매(새벽 00-08시만 4시간 단위)라 정각마다 찍으면 슬롯을 안 놓친다.
// 캡처 후 Claude Vision으로 경쟁사 브랜드 노출 여부를 판별해 잡히면 자동 기록.
cron.schedule('0 0 * * * *', async () => {
  console.log(`\n⏰ 네이버 타임보드/스페셜DA 캡처: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await runNaverPremiumCapture();
  } catch (err) {
    console.error('네이버 캡처 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 경쟁사 동향 시트(타임보드/스페셜DA/유튜브/ATL 4탭) 동기화: 매일 오전 9시 30분.
// 팀이 시트를 수정하면 다음 이 시각에 자동으로 대시보드에 반영된다.
cron.schedule('0 30 9 * * *', async () => {
  console.log(`\n⏰ 경쟁사 동향 시트 동기화: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await updateCompetitorTrendSheet();
  } catch (err) {
    console.error('경쟁사 동향 시트 동기화 중 오류:', err.message);
  }
}, {
  timezone: 'Asia/Seoul',
});

// 경쟁사 유튜브 채널 동향: 매일 오전 9시 30분. 채널별 최근 업로드 25개의 조회수
// 평균을 내서, 이번 달 영상 중 그 평균을 넘는(화제성 있는) 것만 기록한다.
cron.schedule('0 30 9 * * *', async () => {
  console.log(`\n⏰ 유튜브 경쟁사 동향 갱신: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await updateYoutubeCompetitorTrend(settings);
  } catch (err) {
    console.error('유튜브 경쟁사 동향 중 오류:', err.message);
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

// 구글 이미지 소재 설명(aiDescription) 백필: 문구가 없는(모델/비주얼 위주) 구글 이미지를
// Claude가 직접 읽어 설명을 채운다. 하루 300건씩 - 처음엔 메리츠증권만 대상으로 수동
// 실행했다가 다른 8개 브랜드 백필이 끝난 뒤에야 전체 대상이 됨을 확인(2026-08-09), 이제
// 매일 자동으로 나머지 브랜드까지 채워지도록 등록.
cron.schedule('0 35 7 * * *', async () => {
  console.log(`\n⏰ 구글 디스크립션 백필 실행: ${new Date().toLocaleString('ko-KR')}`);
  try {
    await backfillDescriptions(300);
  } catch (err) {
    console.error('구글 디스크립션 백필 중 오류:', err.message);
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
