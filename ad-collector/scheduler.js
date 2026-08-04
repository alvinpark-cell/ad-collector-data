/**
 * 스케줄러
 * 평일(월~금) 오후 1시에 자동으로 광고 수집을 실행합니다.
 * 
 * 실행 방법: node scheduler.js
 * (컴퓨터가 켜져 있는 동안 계속 실행되어야 합니다)
 */

const cron = require('node-cron');
const { collect } = require('./collector');
const { runNextBrandBatch } = require('./metaBrandBatch');
const { runMetaMediaBatch } = require('./metaMediaBatch');
const { updateMarketIndex } = require('./scrapers/marketIndex');
const settings = require('./settings.json');

console.log('📅 스케줄러 시작');
console.log('   평일(월~금) 오후 1시에 자동 수집됩니다 (키워드 + Google + 네이버).');
console.log('   메타 브랜드 9개는 2시간마다(짝수 시) 3개씩 나눠서 순환 수집됩니다 (IP 차단 방지).');
console.log('   메타 광고 이미지/영상은 2시간마다(홀수 시) 조금씩 채워집니다 (IP 차단 방지).');
console.log('   코스피/코스닥/나스닥 지수는 매일 오전 9시에 갱신됩니다.');
console.log('   지금 바로 실행하려면: node collector.js\n');

// cron 표현식: 초 분 시 일 월 요일
// '0 0 13 * * 1-5' = 매주 월~금 13:00:00
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

// 프로세스가 종료되지 않도록 유지
process.on('SIGINT', () => {
  console.log('\n👋 스케줄러 종료');
  process.exit(0);
});
