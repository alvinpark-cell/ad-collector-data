/**
 * Apify 계정 2 — "주식" 키워드 검색
 * 특정 브랜드로 한정하지 않고, 광고주명에 "증권"/"은행"이 붙은 곳은 다 잡는다
 * (account1.js와 같은 방식, 검색어만 "주식"으로 다름)
 * 실제 필터링은 apifyMetaClient.js의 isFinancialAdvertiser()에서 처리.
 *
 * 여기서는 메타데이터만 가져온다 (mediaType/mediaUrl 없음).
 * 실제 이미지/영상은 collector.js가 scrapers/metaAdDetail.js로 채운다.
 *
 * 토큰은 settings.json의 apifyAccount2Token에서 읽는다
 * (settings.json은 .gitignore 처리되어 있어 git에 올라가지 않음).
 */

const { fetchAdMetadata } = require('./apifyMetaClient');

const SEARCH_TERMS = [
  { term: '주식', type: 'keyword' },
];

async function runAccount2(settings) {
  const token = settings.apifyAccount2Token || '';
  const maxResults = settings.apifyMaxResultsPerTerm || 50;
  return fetchAdMetadata(SEARCH_TERMS, token, 'Apify-계정2', maxResults);
}

module.exports = { runAccount2 };
