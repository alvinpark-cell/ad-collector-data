/**
 * 커뮤니티 반응 - 주식/투자 관련 일반 키워드와 메리츠증권 관련 키워드가 얼마나
 * 언급되는지 대략적인 "관심도"를 모아 버블차트로 보여주기 위한 수집기.
 *
 * 원래 디시인사이드/MLB파크/인베스팅닷컴 3개 소스를 시도했으나, 실제로 붙여보니:
 * - MLB파크: 방문마다 페이지 구조가 달라져서 안정적으로 파싱이 안 됨
 * - 디시인사이드: "게시판 내 검색" URL 파라미터(s_type/s_keyword)가 실제로는
 *   필터링을 안 하고 그냥 최신글 목록을 그대로 반환함(3가지 s_type 조합으로 확인) -
 *   즉 겉보기엔 되는 것처럼 보이지만 실제로는 키워드와 무관한 가짜 데이터였음
 * 두 소스 다 신뢰할 수 없어 제외하고, 인베스팅닷컴 검색 결과 건수("결과: N")만으로
 * 우선 진행한다. 소스가 하나뿐이라 상대 비교의 다양성은 떨어지지만, 적어도 실제
 * 키워드 기준으로 필터링된 신뢰 가능한 숫자다.
 *
 * 정확한 "최근 7일 언급량"이라기보다, 수집 시점의 검색 결과 규모 스냅샷으로 키워드
 * 간 상대적 관심도를 비교하는 용도다.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { generateInsight, buildInsightPrompt, hasEnoughDataForInsight, NO_INSIGHT_TEXT } = require('../insightClient');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 인베스팅닷컴은 로드 타이밍이 들쭉날쭉해서(광고/개인화 스크립트 때문으로 추정) 한 번
// 실패하면 대기 시간을 늘려서 한 번 더 시도한다.
async function countInvesting(page, keyword, attempt = 1) {
  const url = `https://kr.investing.com/search/?q=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(attempt === 1 ? 2500 : 4500);
  const text = await page.evaluate(() => document.body.innerText);
  const m = text.match(/결과\s*[:：]\s*([\d,]+)/);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  if (attempt < 2) return countInvesting(page, keyword, attempt + 1);
  return 0;
}

async function collectKeywordCounts(browser, keywords) {
  const results = [];
  for (const keyword of keywords) {
    // 검색을 거듭할수록(같은 page를 재사용하면) 사이트가 봇으로 판단하는지 두 번째
    // 검색부터 결과가 비어버리는 현상이 있어서, 매 키워드마다 완전히 새 context/page를
    // 새로 열어 마치 매번 새 방문자인 것처럼 검색한다.
    const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
    const page = await context.newPage();
    let inv = 0;
    try { inv = await countInvesting(page, keyword); } catch (e) { console.log(`  [인베스팅닷컴 실패] "${keyword}": ${e.message}`); }
    console.log(`  "${keyword}" - 인베스팅닷컴 ${inv}건`);
    results.push({ keyword, investing: inv, total: inv });
    await context.close();
    await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

async function generateCommunityInsight(label, counts) {
  const total = counts.reduce((s, c) => s + c.total, 0);
  if (!hasEnoughDataForInsight(total) || counts.every(c => c.total === 0)) return NO_INSIGHT_TEXT;
  const prompt = buildInsightPrompt(
    `다음은 ${label} 키워드별 인베스팅닷컴 검색 결과 건수야(그 키워드에 대한 뉴스/시세/분석 콘텐츠가 얼마나 쌓여있는지 보여주는 상대적 관심도 지표). ` +
    '어떤 키워드가 특히 관심도가 높은지/낮은지, 그 차이가 시사하는 바를 한국어로 정리해줘.'
  );
  try {
    return await generateInsight(prompt, counts.map(c => ({ 키워드: c.keyword, 검색결과건수: c.total })));
  } catch (e) {
    console.error(`[커뮤니티 반응 인사이트] "${label}" 오류:`, e.message);
    return NO_INSIGHT_TEXT;
  }
}

async function updateCommunityTrend(settings) {
  const browser = await chromium.launch({ headless: true });
  const generalKeywords = settings.communityGeneralKeywords || [];
  const brandKeywords = settings.communityBrandKeywords || [];

  console.log('[커뮤니티 반응] 일반 키워드 수집 중...');
  const general = await collectKeywordCounts(browser, generalKeywords);
  console.log('[커뮤니티 반응] 브랜드 키워드 수집 중...');
  const brand = await collectKeywordCounts(browser, brandKeywords);

  await browser.close();

  console.log('[커뮤니티 반응] 인사이트 생성 중...');
  const generalInsight = await generateCommunityInsight('주식/투자/증권 관련 일반', general);
  const brandInsight = await generateCommunityInsight('메리츠증권 관련', brand);

  const result = {
    updatedAt: new Date().toISOString(),
    general, brand,
    generalInsight, brandInsight,
  };
  const outPath = path.join(settings.dataDir, 'community_trend.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log('[커뮤니티 반응] community_trend.json 갱신 완료');
  return result;
}

module.exports = { updateCommunityTrend };
if (require.main === module) {
  const settings = require('../settings.json');
  updateCommunityTrend(settings).catch(err => { console.error('오류:', err); process.exit(1); });
}
