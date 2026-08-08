/**
 * 커뮤니티 반응 - "주식/투자 전반 화제 키워드"(시장 전체)와 "메리츠증권 화제 키워드"
 * (브랜드 특정) 두 그룹에 대해, 실제로 화제가 되고 있는 키워드 TOP 15를 뽑아
 * 감정 분류(긍정/중립/부정) + 상대적 언급량 + 실제 확인된 대표 반응과 함께 매일
 * 기록해서 캘린더로 과거 날짜도 조회하고, 전일 대비/7일 추이 스파크라인을 그릴 수
 * 있게 한다.
 *
 * 소스 전략:
 * - 디시인사이드 주식 갤러리(gall_id=neostock, 예전에 썼던 stock/stock_new1은 죽은
 *   갤러리였고 이건 실제로 살아있는 걸 확인함) + 에펨코리아 주식 게시판(fmkorea.com/stock)
 *   에서 최근 글 제목을 긁어와 Claude에게 "실제로 존재하는 글감"으로 같이 넘긴다 -
 *   이 목록만으로 키워드/반응을 뽑으라는 게 아니라, Claude가 웹 검색으로 찾은 내용과
 *   섞어서 "지어낸 반응"이 아니라 실제 근거가 있는 반응 위주로 답하게 하는 보조 자료다.
 *   두 커뮤니티는 톤/성향이 달라서(디시=밈 섞인 직설적 반응, 펨코=캐주얼한 반응 위주)
 *   같이 넣어두면 한쪽 커뮤니티 색깔에 치우치지 않는 균형 잡힌 소재가 된다.
 * - 나머지 화제 키워드 발굴/감정분류/대표 반응 문장/출처는 Claude(-p CLI, 웹서치 가능)에게
 *   맡긴다 - 언론사/블로그/커뮤니티 등 다양한 소스를 우리가 각각 스크래퍼로 만드는
 *   대신, 이미 웹 검색이 가능한 Claude에게 "실제로 확인해서" 종합하게 하는 방식.
 *
 * 과거 이력은 오늘부터 매일 쌓이는 구조라, 이 스크립트를 처음 돌린 날 이전 데이터는
 * 존재할 수 없다 - 전일 대비/7일 추이는 데이터가 쌓이면서 점점 의미 있어진다.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { generateInsight } = require('../insightClient');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TOP_N = 15;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// 디시인사이드 주식 갤러리(neostock) 최신 글 제목 - Claude에게 근거 자료로 같이 넘길 용도.
// "[123]" 형태의 댓글 수 뱃지가 제목 셀렉터에 같이 잡히는 경우가 있어 그런 건 걸러낸다.
async function fetchDcinsideTitles(browser, pages = 2) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const titles = [];
  try {
    for (let p = 1; p <= pages; p++) {
      await page.goto(`https://gall.dcinside.com/board/lists/?id=neostock&page=${p}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);
      const pageTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.gall_list tbody tr .gall_tit a')).map(a => a.textContent.trim());
      });
      titles.push(...pageTitles.filter(t => t && !/^\[\d+\]$/.test(t)));
    }
  } catch (e) {
    console.log(`  [디시인사이드 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  return Array.from(new Set(titles));
}

// 에펨코리아 주식 게시판 최신 글 제목 - 댓글수/조회수 배지가 같이 딸려오는 span들은
// 제거하고 순수 제목 텍스트만 남긴다. "1", "5" 처럼 숫자 하나만 남는 잔재도 걸러낸다.
async function fetchFmkoreaTitles(browser, pages = 2) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const titles = [];
  try {
    for (let p = 1; p <= pages; p++) {
      const url = p === 1 ? 'https://www.fmkorea.com/stock' : `https://www.fmkorea.com/stock?page=${p}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1000);
      const pageTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('td.title a')).map(a => {
          const clone = a.cloneNode(true);
          clone.querySelectorAll('.comment_count, .cate, span').forEach(e => e.remove());
          return clone.textContent.trim();
        });
      });
      titles.push(...pageTitles.filter(t => t && !/^\d+$/.test(t)));
    }
  } catch (e) {
    console.log(`  [에펨코리아 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  return Array.from(new Set(titles));
}

// 백필용: 디시인사이드 글 목록을 페이지 1부터 이어서 훑으며 "작성일(title 속성의
// YYYY-MM-DD HH:MM:SS)"별로 묶는다. 실측 결과 페이지당 약 12~13개 글이 하루치라,
// 목표 날짜 중 가장 오래된 날짜를 지나칠 때까지 페이지를 계속 넘긴다. 공지/고정글은
// title 속성이 없어서 자동으로 제외된다.
async function fetchDcinsideTitlesByDate(browser, targetDates) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const byDate = {};
  targetDates.forEach(d => { byDate[d] = []; });
  const earliest = [...targetDates].sort()[0];
  const maxPages = 200;

  try {
    for (let p = 1; p <= maxPages; p++) {
      await page.goto(`https://gall.dcinside.com/board/lists/?id=neostock&page=${p}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(500);
      const rows = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.gall_list tbody tr')).map(tr => {
          const titleEl = tr.querySelector('.gall_tit a');
          const dateEl = tr.querySelector('.gall_date');
          const iso = dateEl ? dateEl.getAttribute('title') : null;
          if (!titleEl || !iso) return null;
          return { title: titleEl.textContent.trim(), date: iso.slice(0, 10) };
        }).filter(Boolean);
      });
      if (rows.length === 0) continue;
      rows.forEach(r => { if (byDate[r.date]) byDate[r.date].push(r.title); });
      const oldestOnPage = rows[rows.length - 1].date;
      if (oldestOnPage < earliest) break;
    }
  } catch (e) {
    console.log(`  [디시인사이드 백필 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  Object.keys(byDate).forEach(d => { byDate[d] = Array.from(new Set(byDate[d])); });
  return byDate;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 형식을 찾지 못함');
  const candidate = raw.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    // 지시했는데도 가끔 문자열 값 안에 이스케이프 안 된 개행이 남는 경우가 있어,
    // 실제 개행만 골라 공백으로 치환한 뒤 한 번 더 시도해본다(마지막 안전망).
    const repaired = candidate.replace(/[\r\n]+/g, ' ');
    return JSON.parse(repaired);
  }
}

const RESEARCH_FORMAT = '\n\n반드시 아래 JSON 형식으로만 답해 - 다른 설명이나 마크다운 코드블록 없이 순수 JSON 텍스트만 출력해:\n' +
  '{"keywords": [{"keyword": "문자열", "sentiment": "positive|neutral|negative", "volume": 1~1000 사이 정수(상대적 화제성 추정치), ' +
  '"reactions": [{"source": "매체/커뮤니티명", "text": "실제로 확인한 반응 요약(명사형 또는 짧은 구문, 20자 내외)"}]}]}\n' +
  '키워드는 최대 15개, 각 키워드당 reactions는 1~3개. text는 "~함", "~라는 반응", "~우려" 같은 명사형/구문으로 짧게 끝내고, ' +
  '완전한 서술형 문장(예: "~라고 말했다")으로 풀어쓰지 마. 실제로 확인/검색한 내용 기반으로만 답하고, 근거 없이 지어내지 마. ' +
  '중요: text/keyword/source 값 안에는 큰따옴표(")를 절대 쓰지 마 - 기사 제목 등을 인용할 땐 큰따옴표 대신 「」를 쓰거나 그냥 풀어서 써줘 ' +
  '(큰따옴표를 이스케이프 안 해서 JSON이 깨지는 문제가 있었음). 줄바꿈 문자도 넣지 말고 한 줄로 이어서 써줘.';

async function researchTopicKeywords(scopeLabel, dcinsideTitles, fmkoreaTitles, dateLabel) {
  const timeframe = dateLabel
    ? `${dateLabel} 하루 동안(그 날짜 전후로) 실제로 화제였던`
    : '최근(최근 1~2주 이내) 실제로 화제가 되고 있는';
  const prompt = `${scopeLabel}에 대해 웹 검색해서 ${timeframe} 키워드/이슈를 조사해줘. ` +
    '키워드는 특정 종목명보다는 이슈/테마 단위(예: 수수료 정책, 시장 급락, 특정 이벤트명)를 우선하고, 각 키워드가 시장/커뮤니티에서 ' +
    '긍정적으로 받아들여지는지 부정적으로 받아들여지는지도 판단해줘. 아래는 디시인사이드 주식 갤러리(neostock)' +
    (fmkoreaTitles.length ? '와 에펨코리아 주식 게시판' : '') +
    `에서 실제로 ${dateLabel ? `${dateLabel} 전후로` : '최근'} 올라온 글 제목 목록이야 - 참고 자료로 쓰고, 여기 없는 내용도 웹 검색으로 보충해서 답해도 돼:\n\n` +
    '[디시인사이드 주식 갤러리]\n' + dcinsideTitles.slice(0, 60).map(t => `- ${t}`).join('\n') +
    (fmkoreaTitles.length ? '\n\n[에펨코리아 주식 게시판]\n' + fmkoreaTitles.slice(0, 60).map(t => `- ${t}`).join('\n') : '') +
    RESEARCH_FORMAT;

  // 웹서치가 포함된 조사라 일반 인사이트 생성보다 훨씬 오래 걸림 - 기본 타임아웃(3분)으로는
  // 소스 2개를 합친 뒤로 종종 부족해서(ETIMEDOUT) 5분으로 늘림.
  const text = await generateInsight(prompt, null, { timeout: 300000 });
  return extractJson(text);
}

// 게재일(실제 글 작성일) 기준 과거 이력 백필 - 오늘 이전 daysBack일에 대해 디시인사이드
// 실제 글을 날짜별로 모아서 그 날짜 맥락으로 리서치한다. 이미 history에 있는 날짜는
// 건드리지 않는다(라이브 갱신으로 이미 채워진 오늘자 등을 덮어쓰지 않기 위함).
async function backfillCommunityTrendHistory(settings, daysBack) {
  const outPath = path.join(settings.dataDir, 'community_trend.json');
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : { history: [] };
  const existingDates = new Set((existing.history || []).map(h => h.date));

  const targetDates = [];
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (!existingDates.has(key)) targetDates.push(key);
  }
  if (targetDates.length === 0) {
    console.log('[커뮤니티 반응 백필] 이미 전부 채워져 있어 건너뜀');
    return existing;
  }

  console.log(`[커뮤니티 반응 백필] 대상 날짜: ${targetDates.join(', ')}`);
  const browser = await chromium.launch({ headless: true });
  console.log('[커뮤니티 반응 백필] 디시인사이드 글 날짜별 수집 중 (페이지를 여러 장 넘깁니다)...');
  const byDate = await fetchDcinsideTitlesByDate(browser, targetDates);
  await browser.close();
  targetDates.forEach(d => console.log(`  ${d}: ${byDate[d].length}건`));

  const history = [...(existing.history || [])];
  for (const date of targetDates.sort()) {
    const titles = byDate[date] || [];
    console.log(`[커뮤니티 반응 백필] ${date} 조사 중 (글 ${titles.length}건 기반)...`);
    let generalKeywords = [];
    let brandKeywords = [];
    try {
      const general = await researchTopicKeywords('한국 주식/증권/투자 시장 전반', titles, [], date);
      generalKeywords = (general.keywords || []).slice(0, TOP_N);
    } catch (e) {
      console.error(`  [${date}] 시장 전체 조사 실패:`, e.message);
    }
    try {
      const brand = await researchTopicKeywords('메리츠증권(증권사)과 직접 관련된 주제', titles, [], date);
      brandKeywords = (brand.keywords || []).slice(0, TOP_N);
    } catch (e) {
      console.error(`  [${date}] 메리츠증권 조사 실패:`, e.message);
    }
    history.push({ date, general: generalKeywords, brand: brandKeywords });
    // 매 날짜마다 저장 - 중간에 실패해도 그때까지 백필한 건 안전하게 남도록
    history.sort((a, b) => a.date.localeCompare(b.date));
    fs.writeFileSync(outPath, JSON.stringify({ updatedAt: new Date().toISOString(), history }, null, 2), 'utf-8');
  }

  console.log(`[커뮤니티 반응 백필] 완료 (누적 ${history.length}일치)`);
  return { updatedAt: new Date().toISOString(), history };
}

async function updateCommunityTrend(settings) {
  const browser = await chromium.launch({ headless: true });

  console.log('[커뮤니티 반응] 디시인사이드 주식 갤러리 수집 중...');
  const dcinsideTitles = await fetchDcinsideTitles(browser, 2);
  console.log(`[커뮤니티 반응] 디시인사이드 글 제목 ${dcinsideTitles.length}건 확보`);

  console.log('[커뮤니티 반응] 에펨코리아 주식 게시판 수집 중...');
  const fmkoreaTitles = await fetchFmkoreaTitles(browser, 2);
  console.log(`[커뮤니티 반응] 에펨코리아 글 제목 ${fmkoreaTitles.length}건 확보`);

  await browser.close();

  // 조사가 실패했을 때 빈 배열로 오늘자 데이터를 덮어써버리면 이미 성공적으로 저장된
  // 오늘 데이터가 통째로 날아간다(실제로 한 번 이렇게 날려먹은 적 있음) - 실패 시엔
  // 오늘자 기존 저장값이 있으면 그걸 그대로 유지한다.
  const outPath = path.join(settings.dataDir, 'community_trend.json');
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : { history: [] };
  const today = todayKey();
  const existingToday = (existing.history || []).find(h => h.date === today);

  console.log('[커뮤니티 반응] 시장 전체 화제 키워드 조사 중...');
  let generalKeywords = existingToday ? existingToday.general : [];
  try {
    const general = await researchTopicKeywords('한국 주식/증권/투자 시장 전반', dcinsideTitles, fmkoreaTitles);
    generalKeywords = (general.keywords || []).slice(0, TOP_N);
  } catch (e) {
    console.error('[커뮤니티 반응] 시장 전체 조사 실패, 기존 오늘자 데이터 유지:', e.message);
  }

  console.log('[커뮤니티 반응] 메리츠증권 화제 키워드 조사 중...');
  let brandKeywords = existingToday ? existingToday.brand : [];
  try {
    const brand = await researchTopicKeywords('메리츠증권(증권사)과 직접 관련된 주제', dcinsideTitles, fmkoreaTitles);
    brandKeywords = (brand.keywords || []).slice(0, TOP_N);
  } catch (e) {
    console.error('[커뮤니티 반응] 메리츠증권 조사 실패, 기존 오늘자 데이터 유지:', e.message);
  }

  const todaySnapshot = { date: today, general: generalKeywords, brand: brandKeywords };

  const history = (existing.history || []).filter(h => h.date !== todaySnapshot.date);
  history.push(todaySnapshot);
  history.sort((a, b) => a.date.localeCompare(b.date));

  const result = { updatedAt: new Date().toISOString(), history };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[커뮤니티 반응] community_trend.json 갱신 완료 (누적 ${history.length}일치)`);
  return result;
}

module.exports = { updateCommunityTrend, backfillCommunityTrendHistory };
if (require.main === module) {
  const settings = require('../settings.json');
  const daysBackArg = process.argv[2];
  if (daysBackArg) {
    backfillCommunityTrendHistory(settings, parseInt(daysBackArg, 10)).catch(err => { console.error('오류:', err); process.exit(1); });
  } else {
    updateCommunityTrend(settings).catch(err => { console.error('오류:', err); process.exit(1); });
  }
}
