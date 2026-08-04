/**
 * Apify "Meta Ads Library Scraper" (solidcode/meta-ads-library-scraper, actor ID: jrcXYlbOAUukohvxa)
 * 공통 클라이언트 — account1.js / account2.js 에서 이 파일의 함수들을 가져다 씀.
 *
 * 이 액터는 광고 메타데이터(광고주명/카피/랜딩URL/게재일/상태/ID)만 주고
 * 실제 이미지/영상 다운로드 URL은 주지 않는다 (adSnapshotUrl은 iframe 렌더 링크일 뿐).
 * 그래서 여기서는 메타데이터만 만들고, 실제 미디어는 scrapers/metaAdDetail.js가
 * adId로 개별 광고 페이지를 Playwright로 방문해서 채운다.
 */

const ACTOR_ID = 'jrcXYlbOAUukohvxa'; // solidcode/meta-ads-library-scraper (Apify Store에서 확인한 실제 액터 ID)

// 광고주명에 "증권"/"은행"이 붙은 곳만 통과시킨다 (OO증권, OO은행 형태)
// 필요하면 여기 목록만 추가/수정하면 됨
const ALLOWED_ADVERTISER_PATTERNS = [
  '증권', '은행',
];

function isFinancialAdvertiser(pageName) {
  if (!pageName) return false;
  return ALLOWED_ADVERTISER_PATTERNS.some(p => pageName.includes(p));
}

function normalizeName(s) {
  return (s || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * 브랜드 검색은 "금융회사인가"만 확인하면 부족함 — Facebook 검색이 느슨해서
 * 전혀 다른 증권사(예: "NH투자증권" 검색에 "나무증권" 결과가 섞여 들어옴)가
 * 통과해버림. 그래서 브랜드 검색은 실제 pageName이 검색어(=찾는 브랜드)와
 * 겹치는지까지 확인한다.
 */
function matchesBrand(pageName, term) {
  const a = normalizeName(pageName);
  const b = normalizeName(term);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * 액터 원본 응답 1건(광고 1건) → 우리 스키마의 "메타데이터 행" 1개
 * mediaType/mediaUrl은 아직 없음 — metaAdDetail.js의 hydrateWithMedia()가 채워줌
 */
function mapApifyItemToAdMeta(raw, term, type) {
  const placements = Array.isArray(raw.publisherPlatforms)
    ? raw.publisherPlatforms.map(p => String(p).toLowerCase()).join(',')
    : '';
  const copyText = raw.adText || (Array.isArray(raw.adCreativeBodies) ? raw.adCreativeBodies[0] : '') || '';

  return {
    advertiserName: raw.pageName || '',
    copyText: copyText.slice(0, 500),
    headline: raw.ctaHeadline || '',
    landingUrl: raw.ctaUrl || '',
    sourceUrl: raw.adLibraryURL || '',
    snapshotUrl: raw.adSnapshotUrl || '', // 광고 1건만 렌더링하는 전용 링크 (metaAdDetail.js가 사용)
    adId: raw.adArchiveID || '',       // dedup 기준 ID이자 상세페이지 방문용 ID
    adStartedAt: raw.startDate || null,
    adLastShownAt: raw.endDate || null,
    status: raw.adStatus === 'INACTIVE' ? 'ended' : 'active',
    platform: 'meta',
    collectedAt: new Date().toISOString(), // scrapers/meta.js, google.js와 동일하게 여기서도 직접 채워야 함 (안 채우면 ad-ref 정렬에서 죽음)
    placements,
    keyword: term,
    searchType: type,
  };
}

/**
 * 액터 1회 호출 (동기 방식 - 결과 나올 때까지 기다림)
 */
async function callApifyActor(searchTerm, apifyToken, maxResults) {
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apifyToken}`;
  const body = {
    searchTerms: [searchTerm],
    country: 'KR',
    adActiveStatus: 'ACTIVE',
    adType: 'ALL',
    mediaType: 'ALL',
    includeAboutPage: false,   // 페이지 소개/팔로워 정보는 필요 없어서 비용 절감 차원에서 끔
    scrapeAdDetails: true,     // ctaUrl(랜딩URL) 등을 받으려면 필요
    onlyTotalCount: false,
    maxResults: maxResults || 50,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apify 호출 실패 (${res.status}): ${errText.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * 검색어 목록(브랜드 위주)을 순회하며 메타데이터 수집 + 금융권 필터링
 * @param {{term:string, type:'keyword'|'brand'}[]} searchTerms
 * @param {string} apifyToken
 * @param {string} accountLabel - 로그 구분용
 * @param {number} maxResultsPerTerm - 검색어당 최대 결과 수 (비용 관리용)
 */
async function fetchAdMetadata(searchTerms, apifyToken, accountLabel, maxResultsPerTerm) {
  if (!apifyToken) {
    console.log(`[${accountLabel}] 토큰이 설정되지 않아 건너뜀 (settings.json 확인)`);
    return [];
  }

  const results = [];
  for (const { term, type } of searchTerms) {
    console.log(`[${accountLabel}] 검색 중: "${term}" (${type})`);
    try {
      const rawItems = await callApifyActor(term, apifyToken, maxResultsPerTerm);
      const passed = rawItems.filter(raw => (
        type === 'brand' ? matchesBrand(raw.pageName, term) : isFinancialAdvertiser(raw.pageName)
      ));
      const skipped = rawItems.length - passed.length;
      const rows = passed.map(raw => mapApifyItemToAdMeta(raw, term, type));

      results.push(...rows);
      console.log(`[${accountLabel}] "${term}" → 원본 ${rawItems.length}개 (무관한 광고주 ${skipped}개 제외) → ${rows.length}개 광고 메타데이터`);
    } catch (err) {
      console.error(`[${accountLabel}] "${term}" 오류:`, err.message);
    }
  }
  return results;
}

module.exports = {
  fetchAdMetadata,
  isFinancialAdvertiser,
  matchesBrand,
  mapApifyItemToAdMeta,
};
