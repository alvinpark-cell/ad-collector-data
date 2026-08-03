// 수집기(ad-collector)의 utils.js getMonthWeekKey와 동일한 계산 방식
// (그 달의 며칠째 주인지를 기준으로 하는 단순 계산 - 절대 주차 아님)
export function getMonthWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const weekOfMonth = Math.ceil(d.getDate() / 7);
  return `${year}-${month}-W${weekOfMonth}`;
}

export function formatMonthWeekLabel(key: string): string {
  const parts = key.split('-');
  const month = parts[1];
  const weekNum = (parts[2] || '').replace('W', '');
  return `${parseInt(month, 10)}월 ${weekNum}주차`;
}

// 최신순으로 정렬된 월/주차 키 목록 (내림차순 - 최근 주가 먼저)
export function sortMonthWeekKeysDesc(keys: string[]): string[] {
  return Array.from(new Set(keys)).sort((a, b) => b.localeCompare(a));
}

// 특정 월/주차 키가 속한 "YYYY-MM" 값
export function getYearMonthOfKey(key: string): string {
  const parts = key.split('-');
  return `${parts[0]}-${parts[1]}`;
}

// 캘린더 네비게이션용: 주어진 키 목록에 등장하는 연-월 목록 (오름차순)
export function getAvailableYearMonths(keys: string[]): string[] {
  return Array.from(new Set(keys.map(getYearMonthOfKey))).sort();
}

export interface MonthWeekSlot {
  key: string; // ex) 2026-08-W1
  weekNum: number;
  startDay: number;
  endDay: number;
}

// 해당 연/월의 "n주차" 슬롯 목록 생성 (수집기 getMonthWeekKey와 동일 규칙: ceil(day/7))
export function buildMonthWeekSlots(year: number, month: number): MonthWeekSlot[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalWeeks = Math.ceil(daysInMonth / 7);
  const mm = String(month).padStart(2, '0');
  const slots: MonthWeekSlot[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const startDay = (w - 1) * 7 + 1;
    const endDay = Math.min(w * 7, daysInMonth);
    slots.push({ key: `${year}-${mm}-W${w}`, weekNum: w, startDay, endDay });
  }
  return slots;
}
