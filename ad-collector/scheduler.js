/**
 * 스케줄러
 * 평일(월~금) 오후 1시에 자동으로 광고 수집을 실행합니다.
 * 
 * 실행 방법: node scheduler.js
 * (컴퓨터가 켜져 있는 동안 계속 실행되어야 합니다)
 */

const cron = require('node-cron');
const { collect } = require('./collector');

console.log('📅 스케줄러 시작');
console.log('   평일(월~금) 오후 1시에 자동 수집됩니다.');
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

// 프로세스가 종료되지 않도록 유지
process.on('SIGINT', () => {
  console.log('\n👋 스케줄러 종료');
  process.exit(0);
});
