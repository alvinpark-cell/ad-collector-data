/**
 * Apify 계정 1 — 브랜드 검색 (전부 브랜드 타입)
 * 삼성증권, 미래에셋증권, NH투자증권, KB증권
 *
 * 여기서는 메타데이터만 가져온다 (mediaType/mediaUrl 없음).
 * 실제 이미지/영상은 collector.js가 scrapers/metaAdDetail.js로 채운다.
 *
 * 토큰은 settings.json의 apifyAccount1Token에서 읽는다
 * (settings.json은 .gitignore 처리되어 있어 git에 올라가지 않음).
 */

const { fetchAdMetadata } = require('./apifyMetaClient');

const SEARCH_TERMS = [
  { term: '삼성증권', type: 'brand' },
  { term: '미래에셋증권', type: 'brand' },
  { term: 'NH투자증권', type: 'brand' },
  { term: 'KB증권', type: 'brand' },
];

async function runAccount1(settings) {
  const token = settings.apifyAccount1Token || '';
  const maxResults = settings.apifyMaxResultsPerTerm || 50;
  return fetchAdMetadata(SEARCH_TERMS, token, 'Apify-계정1', maxResults);
}

module.exports = { runAccount1 };
