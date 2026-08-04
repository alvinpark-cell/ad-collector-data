/**
 * 광고주명 정규화 + 브랜드 매칭 + 스캠성 광고 판별 공용 유틸.
 * page.tsx의 brandStats, creativeInsight.js의 byBrand 등에서 각자 다르게 하던
 * `.includes()` 매칭을 여기 하나로 모은다. (ad-ref/src/lib/brandUtils.ts에 동일 로직 미러링)
 */

// "(주)", "㈜", "주식회사" 같은 법인 표기 접미사/접두사를 지워서 비교용 문자열을 만든다.
function normalizeName(name) {
  if (!name) return '';
  return name
    .replace(/주식회사/g, '')
    .replace(/\(주\)/g, '')
    .replace(/㈜/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function matchesBrand(advertiserName, brand) {
  const a = normalizeName(advertiserName);
  const b = normalizeName(brand);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// 스캠 광고 판별: "염승환" 같은 특정 인물명/스캠 문구 단위로만 매칭한다.
// "LS증권" 같은 정상 증권사명은 절대 넣지 않는다 - 실제 증권사이기 때문.
const DEFAULT_DENYLIST = ['염승환', '루틴증권'];

// "루틴 증권"처럼 단어 사이에 공백이 끼는 경우도 잡아내야 해서, 공백을 지운 뒤 비교한다
// ("주주: 루틴 증권" 같은 실제 스캠 광고주명에서 발견됨).
function isJunkAdvertiser(name, text, denylist) {
  const list = denylist && denylist.length ? denylist : DEFAULT_DENYLIST;
  const haystack = `${name || ''} ${text || ''}`.replace(/\s+/g, '');
  return list.some(term => term && haystack.includes(term.replace(/\s+/g, '')));
}

module.exports = { normalizeName, matchesBrand, isJunkAdvertiser, DEFAULT_DENYLIST };
