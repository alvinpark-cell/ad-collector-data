/**
 * 한국 공휴일 목록 - 서버는 사람처럼 "오늘 쉬는 날이니 자동으로 안 도는" 개념이 없어서
 * (크론은 휴일이든 아니든 정해진 시각에 그냥 실행됨), 메타/구글처럼 "주 1회, 이번 한 번을
 * 놓치면 그 주는 통째로 못 하는" 작업은 공휴일 여부를 직접 확인해서 다음 평일로 미뤄야 한다.
 *
 * ⚠️ 고정일 공휴일(매년 같은 날짜)은 아래 목록을 그대로 써도 안전하지만, 음력 기반 공휴일
 * (설날/추석/부처님오신날)은 매년 날짜가 바뀌므로 LUNAR_HOLIDAYS_KR 값은 "참고용 추정치"다.
 * 실제 운영 전 반드시 공식 캘린더로 재확인하고, 매년 말에 다음 해 날짜를 추가해줘야 한다
 * (빠뜨리면 그 공휴일에 그냥 평소대로 도는 것뿐이라 안전 실패이긴 하지만, 그래도 확인 권장).
 */

// 매년 같은 날짜 - 신뢰 가능
const FIXED_HOLIDAYS_MMDD = [
  '01-01', // 신정
  '03-01', // 삼일절
  '05-05', // 어린이날
  '06-06', // 현충일
  '08-15', // 광복절
  '10-03', // 개천절
  '10-09', // 한글날
  '12-25', // 크리스마스
];

// 음력 기반 공휴일 - 연도별로 직접 채워야 함. 아래 2026년 값은 추정치(운영 전 재확인 필요).
const LUNAR_HOLIDAYS_KR = {
  2026: [
    '2026-02-16', '2026-02-17', '2026-02-18', // 설날 연휴(추정)
    '2026-05-24', // 부처님오신날(추정)
    '2026-09-24', '2026-09-25', '2026-09-26', // 추석 연휴(추정)
  ],
};

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isHoliday(date) {
  const iso = toIsoDate(date);
  if (FIXED_HOLIDAYS_MMDD.includes(iso.slice(5))) return true;
  const lunarList = LUNAR_HOLIDAYS_KR[date.getFullYear()] || [];
  return lunarList.includes(iso);
}

function isWeekend(date) {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

module.exports = { isHoliday, isWeekend, toIsoDate };
