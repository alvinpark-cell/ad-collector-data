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
