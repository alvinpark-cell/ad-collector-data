// 광고주명 정규화 + 브랜드 매칭 유틸.
// ad-collector/brandUtils.js와 동일한 로직 - 두 프로젝트가 빌드 파이프라인을 공유하지
// 않아서 의도적으로 미러링해뒀다 (로직이 작고 안정적이라 중복 유지 비용이 낮음).

export function normalizeName(name: string | undefined | null): string {
  if (!name) return '';
  return name
    .replace(/주식회사/g, '')
    .replace(/\(주\)/g, '')
    .replace(/㈜/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export function matchesBrand(advertiserName: string | undefined | null, brand: string): boolean {
  const a = normalizeName(advertiserName);
  const b = normalizeName(brand);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
