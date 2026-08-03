/**
 * Apify 계정 2 — 브랜드 검색 (전부 브랜드 타입)
 * 신한투자증권, 한국투자증권, 키움증권, 토스증권, 메리츠증권
 *
 * 여기서는 메타데이터만 가져온다 (mediaType/mediaUrl 없음).
 * 실제 이미지/영상은 collector.js가 scrapers/metaAdDetail.js로 채운다.
 *
 * 토큰은 settings.json의 apifyAccount2Token에서 읽는다
 * (settings.json은 .gitignore 처리되어 있어 git에 올라가지 않음).
 */

const { fetchAdMetadata } = require('./apifyMetaClient');

const SEARCH_TERMS = [
  { term: '신한투자증권', type: 'brand' },
  { term: '한국투자증권', type: 'brand' },
  { term: '키움증권', type: 'brand' },
  { term: '토스증권', type: 'brand' },
  { term: '메리츠증권', type: 'brand' },
];

async function runAccount2(settings) {
  const token = settings.apifyAccount2Token || '';
  const maxResults = settings.apifyMaxResultsPerTerm || 50;
  return fetchAdMetadata(SEARCH_TERMS, token, 'Apify-계정2', maxResults);
}

module.exports = { runAccount2 };
