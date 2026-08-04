/**
 * 커뮤니티 반응 - 주식/투자/증권 관련 일반 키워드와 메리츠증권 관련 키워드가 얼마나
 * 언급되는지 대략적인 "관심도"를 모아 버블차트로 보여주기 위한 수집기.
 *
 * 원래 디시인사이드/MLB파크/인베스팅닷컴 3개 소스를 시도했으나, 실제로 붙여보니:
 * - MLB파크: 방문마다 페이지 구조가 달라져서 안정적으로 파싱이 안 됨
 * - 디시인사이드: "게시판 내 검색" URL 파라미터(s_type/s_keyword)가 실제로는
 *   필터링을 안 하고 그냥 최신글 목록을 그대로 반환함. 게다가 한 번 더 확인해보니
 *   "주식 갤러리"로 알려진 gall_id들(stock, stock_new1)이 실제로는 2011년에 활동이
 *   끊긴 옛 갤러리이거나 전혀 무관한 밈 갤러리로 재활용된 상태라, 게시글 제목에서
 *   키워드를 추출하는 용도로도 못 쓸 정도로 신뢰할 수 없음이 재확인됨.
 * 두 소스 다 제외.
 *
 * 일반 키워드는 더 이상 settings.json에 사람이 미리 정해두지 않는다. 대신 네이버
 * 금융의 "실시간 급상승/인기검색 종목" 페이지(lastsearch2.naver)에서 그 시점 기준
 * 실제로 가장 많이 검색되는 종목 상위 N개를 그대로 가져와서 매번 다르게 구성한다 -
 * 이 페이지는 네이버가 자체 집계하는 실제 검색 순위라 커뮤니티 게시글에서 직접
 * 키워드를 추출하는 것보다 훨씬 안정적이고 신뢰할 수 있는 "인기 키워드" 소스다.
 * 종목별 "실제 반응"은 그 종목의 네이버 종목토론실(투자자 게시판) 최신 글 제목을
 * 그대로 보여준다 - 실제 투자자들이 쓴 글이라 검색 결과 건수보다 훨씬 생생하다.
 * 관심도 수치 자체는 기존처럼 인베스팅닷컴 검색 결과 건수를 그대로 쓴다.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { generateInsight, buildInsightPrompt, hasEnoughDataForInsight, NO_INSIGHT_TEXT } = require('../insightClient');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TOP_N_GENERAL = 6;
const SAMPLE_REACTIONS_PER_KEYWORD = 5;

// 네이버 금융의 실시간 인기검색 종목 순위 - 사람이 미리 정한 목록이 아니라 그 시점에
// 실제로 가장 많이 검색된 종목을 그대로 가져오는 용도.
async function fetchTopSearchedStocks(browser, n) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  try {
    await page.goto('https://finance.naver.com/sise/lastsearch2.naver', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);
    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table.type_5 tbody tr')).map(tr => {
        const a = tr.querySelector('a[href*="code="]');
        if (!a) return null;
        const m = a.getAttribute('href').match(/code=(\d+)/);
        return m ? { name: a.textContent.trim(), code: m[1] } : null;
      }).filter(Boolean);
    });
    return rows.slice(0, n);
  } finally {
    await context.close();
  }
}

// 특정 종목의 네이버 종목토론실 최신 글 제목 몇 개 - "커뮤니티 실제 반응"용 샘플.
async function fetchDiscussionSample(browser, code, n) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  try {
    await page.goto(`https://finance.naver.com/item/board.naver?code=${code}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);
    const titles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table.type2 tr')).map(tr => {
        const a = tr.querySelector('td.title a');
        if (!a) return null;
        return (a.getAttribute('title') || a.textContent || '').trim();
      }).filter(Boolean);
    });
    return titles.slice(0, n);
  } catch (e) {
    console.log(`  [종목토론실 실패] ${code}: ${e.message}`);
    return [];
  } finally {
    await context.close();
  }
}

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

async function collectKeywordCounts(browser, items) {
  const results = [];
  for (const item of items) {
    const keyword = typeof item === 'string' ? item : item.name;
    const code = typeof item === 'string' ? null : item.code;
    // 검색을 거듭할수록(같은 page를 재사용하면) 사이트가 봇으로 판단하는지 두 번째
    // 검색부터 결과가 비어버리는 현상이 있어서, 매 키워드마다 완전히 새 context/page를
    // 새로 열어 마치 매번 새 방문자인 것처럼 검색한다.
    const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
    const page = await context.newPage();
    let inv = 0;
    try { inv = await countInvesting(page, keyword); } catch (e) { console.log(`  [인베스팅닷컴 실패] "${keyword}": ${e.message}`); }
    console.log(`  "${keyword}" - 인베스팅닷컴 ${inv}건`);
    await context.close();

    let sampleReactions = [];
    if (code) {
      sampleReactions = await fetchDiscussionSample(browser, code, SAMPLE_REACTIONS_PER_KEYWORD);
      console.log(`  "${keyword}" - 종목토론실 실제 반응 ${sampleReactions.length}건`);
    }

    results.push({ keyword, code, investing: inv, total: inv, sampleReactions });
    await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

async function generateCommunityInsight(label, counts) {
  const total = counts.reduce((s, c) => s + c.total, 0);
  if (!hasEnoughDataForInsight(total) || counts.every(c => c.total === 0)) return NO_INSIGHT_TEXT;
  const prompt = buildInsightPrompt(
    `다음은 ${label} 키워드별 인베스팅닷컴 검색 결과 건수와, 종목이라면 네이버 종목토론실 최신 글 제목 몇 개를 같이 준 것이야 ` +
    '(검색 결과 건수는 그 키워드에 대한 뉴스/시세/분석 콘텐츠가 얼마나 쌓여있는지 보여주는 상대적 관심도 지표, 토론실 글 제목은 실제 투자자 반응). ' +
    '어떤 키워드가 특히 관심도가 높은지/낮은지, 토론실 글 제목에서 드러나는 실제 투자자 심리(기대/우려/논쟁 등)는 어떤지를 한국어로 정리해줘.'
  );
  try {
    return await generateInsight(prompt, counts.map(c => ({
      키워드: c.keyword, 검색결과건수: c.total,
      실제반응샘플: c.sampleReactions && c.sampleReactions.length ? c.sampleReactions : undefined,
    })));
  } catch (e) {
    console.error(`[커뮤니티 반응 인사이트] "${label}" 오류:`, e.message);
    return NO_INSIGHT_TEXT;
  }
}

async function updateCommunityTrend(settings) {
  const browser = await chromium.launch({ headless: true });
  const brandKeywords = settings.communityBrandKeywords || [];

  console.log('[커뮤니티 반응] 실시간 인기검색 종목 조회 중...');
  const topStocks = await fetchTopSearchedStocks(browser, TOP_N_GENERAL);
  console.log('[커뮤니티 반응] 이번 회차 일반 키워드(실시간 인기검색 상위):', topStocks.map(s => s.name).join(', '));

  console.log('[커뮤니티 반응] 일반 키워드 수집 중...');
  const general = await collectKeywordCounts(browser, topStocks);
  console.log('[커뮤니티 반응] 브랜드 키워드 수집 중...');
  const brand = await collectKeywordCounts(browser, brandKeywords);

  await browser.close();

  console.log('[커뮤니티 반응] 인사이트 생성 중...');
  const generalInsight = await generateCommunityInsight('주식/투자/증권 실시간 인기검색', general);
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
