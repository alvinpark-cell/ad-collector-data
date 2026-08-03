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
const settings = require('./settings.json');

console.log('📅 스케줄러 시작');
console.log('   평일(월~금) 오후 1시에 자동 수집됩니다 (키워드 + Google + 네이버).');
console.log('   메타 브랜드 9개는 2시간마다 3개씩 나눠서 순환 수집됩니다 (IP 차단 방지).');
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

// 프로세스가 종료되지 않도록 유지
process.on('SIGINT', () => {
  console.log('\n👋 스케줄러 종료');
  process.exit(0);
});
