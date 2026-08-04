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

// 증권사가 자기 이름 대신 별도 앱/서브 브랜드명으로 광고하는 경우 - ad-collector/brandUtils.js와
// 동일한 별칭 목록 (NH투자증권의 MTS 앱 브랜드명이 "나무증권").
const BRAND_ALIASES: Record<string, string[]> = {
  'NH투자증권': ['나무증권', '나무'],
};

export function matchesBrand(advertiserName: string | undefined | null, brand: string): boolean {
  const a = normalizeName(advertiserName);
  const b = normalizeName(brand);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aliases = BRAND_ALIASES[brand] || [];
  return aliases.some(alias => {
    const al = normalizeName(alias);
    return al && (a.includes(al) || al.includes(a));
  });
}
