/**
 * 공휴일을 감안한 "이번 주 실행일" 판정 헬퍼.
 */

const { isHoliday, isWeekend } = require('./holidays');

/**
 * 오늘이 "이번 주(월요일부터)에 처음 맞이하는, 주말도 공휴일도 아닌 평일"인지 확인한다.
 * 월요일이 공휴일이면 화요일로, 화요일도 공휴일이면 수요일로... 자동으로 밀린다
 * (추석처럼 월~수 연휴가 겹쳐도 공휴일이 아닌 첫 평일까지 그대로 밀림).
 * 메타/구글처럼 "주 1회, 이번 한 번을 놓치면 그 주는 통째로 못 하는" 작업의 트리거로 쓴다 -
 * 크론 자체는 매일 같은 시각에 돌되, 이 함수가 true를 반환하는 날에만 실제로 실행한다.
 */
function isFirstBusinessDayOfWeek(date) {
  if (isWeekend(date) || isHoliday(date)) return false;
  const dow = date.getDay(); // 1=월 ... 5=금
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dow - 1));
  for (let d = new Date(monday); d < date; d.setDate(d.getDate() + 1)) {
    if (!isWeekend(d) && !isHoliday(d)) return false; // 오늘보다 앞서 이미 평일+비공휴일이 있었음
  }
  return true;
}

module.exports = { isFirstBusinessDayOfWeek };
