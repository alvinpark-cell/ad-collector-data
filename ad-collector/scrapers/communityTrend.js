/**
 * 커뮤니티 반응 - "주식/투자 전반 화제 키워드"(시장 전체)와 "메리츠증권 화제 키워드"
 * (브랜드 특정) 두 그룹에 대해, 실제로 화제가 되고 있는 키워드 TOP 15를 뽑아
 * 감정 분류(긍정/중립/부정) + 상대적 언급량 + 실제 확인된 대표 반응과 함께 매일
 * 기록해서 캘린더로 과거 날짜도 조회하고, 전일 대비/7일 추이 스파크라인을 그릴 수
 * 있게 한다.
 *
 * 소스 전략(2026-08-11 개편):
 * - Claude 웹서치를 완전히 제거했다 - 이전에는 웹서치로 뉴스/기관/블로그까지 섞여
 *   들어와서 "커뮤니티 반응" 탭 취지와 안 맞았음(머니투데이/디지털데일리/뉴시스 등).
 *   지금은 실제 주식 커뮤니티 7곳에서 직접 긁어온 글 제목만 Claude에게 근거로 넘기고,
 *   "이 안에서만 화제 키워드/감정/대표 반응을 뽑아라, 다른 출처는 쓰지 마라"고 강제한다.
 * - 7개 커뮤니티: 디시인사이드 주식 갤러리(neostock), 에펨코리아 주식 게시판, 뽐뿌
 *   증권포럼, 클리앙 주식한담, 아카라이브 주식 채널, 더쿠 주식, 블라인드 주식·투자.
 *   각 커뮤니티마다 톤/성향이 달라서(디시=밈 섞인 직설, 펨코/더쿠=캐주얼, 클리앙=시황
 *   분석 위주, 뽐뿌/아카라이브=실시간 반응, 블라인드=직장인 특유의 솔직한 반응) 같이
 *   넣어두면 한쪽으로 치우치지 않는 균형 잡힌 소재가 된다.
 * - reactions의 source 필드에는 실제로 그 반응이 나온 커뮤니티 이름을 그대로 쓰게 해서
 *   화면에 출처가 남도록 한다.
 * - 블라인드는 최신 글이 상대 시간("어제", "3일" 등)으로만 표시돼서 과거 특정 날짜로
 *   되짚어 분류할 수 없다 - 그래서 실시간(매일) 수집에만 포함하고, 날짜별 백필
 *   대상에서는 제외한다.
 * - 아카라이브 주식 채널도 날짜별 백필에서는 제외한다 - 게시량이 폭증하는 시점(시장
 *   급등/급락 이벤트 직후 등)에는 페이지를 수백~수천 장 넘겨도 하루 전 날짜조차 못
 *   지나칠 정도로 트래픽이 몰려서, 과거 날짜로 되짚어가는 방식 자체가 비현실적이다
 *   (2026-08-11 실측 - 그날 급등 이벤트로 11일치 백필 전체가 0건으로 실패). 실시간
 *   수집에는 포함한다.
 *
 * 과거 이력은 이 스크립트를 처음 돌린 날부터 매일 쌓이는 구조라, 전일 대비/7일 추이는
 * 데이터가 쌓이면서 점점 의미 있어진다.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { generateInsight } = require('../insightClient');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TOP_N = 15;

// toISOString()은 항상 UTC라서, 한국 시간 오전 9시 이전에 이 함수를 부르면 실제로는
// 하루 전 날짜가 나온다(예: KST 08:00은 UTC로 전날 23:00) - 이 컴퓨터의 OS 시간대가
// 한국(Asia/Seoul)이라는 전제로, UTC 대신 로컬 날짜 구성요소를 그대로 쓴다.
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return localDateKey(new Date());
}

// 매일 09시30분에 도는 실시간 수집은 "오늘"이 아니라 "어제 하루치"를 기록해야 한다 - 그
// 시점에는 어제는 이미 하루가 다 끝난 완전한 데이터지만, 오늘은 겨우 몇 시간 지난 반쪽
// 데이터라 화제 키워드가 다 안 모인 채로 "오늘자"로 확정되어 버리는 문제가 있었음
// (2026-08-10 수정).
function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateKey(d);
}

// ── 디시인사이드 주식 갤러리(neostock) ──────────────────────────────────────
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

// ── 에펨코리아 주식 게시판 ───────────────────────────────────────────────
// 댓글수/조회수 배지가 같이 딸려오는 span들은 제거하고 순수 제목 텍스트만 남긴다.
// "1", "5" 처럼 숫자 하나만 남는 잔재도 걸러낸다. (날짜별 백필은 지원하지 않음 -
// 원래부터 실시간 수집에만 쓰였음)
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

// ── 뽐뿌 증권포럼 ─────────────────────────────────────────────────────
async function fetchPpomppuTitles(browser, pages = 2) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const titles = [];
  try {
    for (let p = 1; p <= pages; p++) {
      await page.goto(`https://www.ppomppu.co.kr/zboard/zboard.php?id=stock&page=${p}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(800);
      const pageTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('tr.baseList a.baseList-title')).map(a => a.textContent.trim());
      });
      titles.push(...pageTitles.filter(Boolean));
    }
  } catch (e) {
    console.log(`  [뽐뿌 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  return Array.from(new Set(titles));
}

// ── 클리앙 주식한담 ───────────────────────────────────────────────────
async function fetchClienTitles(browser, pages = 2) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const titles = [];
  try {
    for (let p = 1; p <= pages; p++) {
      await page.goto(`https://www.clien.net/service/board/cm_stock?&od=T31&category=0&po=${p - 1}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(800);
      const pageTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.list_item .subject_fixed')).map(el => el.textContent.trim());
      });
      titles.push(...pageTitles.filter(Boolean));
    }
  } catch (e) {
    console.log(`  [클리앙 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  return Array.from(new Set(titles));
}

// ── 아카라이브 주식 채널 ─────────────────────────────────────────────
async function fetchArcaliveTitles(browser, pages = 2) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const titles = [];
  try {
    for (let p = 1; p <= pages; p++) {
      await page.goto(`https://arca.live/b/stock?p=${p}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(800);
      const pageTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a.vrow.column .title')).map(el => el.textContent.replace(/\s+/g, ' ').trim());
      });
      titles.push(...pageTitles.filter(Boolean));
    }
  } catch (e) {
    console.log(`  [아카라이브 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  return Array.from(new Set(titles));
}

// ── 더쿠 주식 ───────────────────────────────────────────────────────
// 상단 고정 공지("notice" 클래스)를 걸러내야 실제 토론 글만 남는다.
async function fetchTheqooTitles(browser, pages = 2) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const titles = [];
  try {
    for (let p = 1; p <= pages; p++) {
      const url = p === 1 ? 'https://theqoo.net/stock' : `https://theqoo.net/stock?page=${p}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(800);
      const pageTitles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('table tr'))
          .filter(tr => !tr.className.includes('notice'))
          .map(tr => {
            const a = tr.querySelector('.title a');
            return a ? a.textContent.trim() : null;
          })
          .filter(Boolean);
      });
      titles.push(...pageTitles);
    }
  } catch (e) {
    console.log(`  [더쿠 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  return Array.from(new Set(titles));
}

// ── 블라인드 주식·투자 ───────────────────────────────────────────────
// SPA라 같은 글(href)마다 배지("NOW"/"HOT")·제목·본문 미리보기·작성자·조회수·댓글수·
// 작성시간 텍스트가 순서대로 반복되는 <a> 태그 여러 개로 렌더링된다. href로 묶은 뒤
// 그 중 "진짜 제목처럼 보이는" 첫 항목만 남긴다. 작성시간이 상대 시간("어제" 등)이라
// 날짜별 백필은 지원하지 않고 실시간 수집에만 사용한다.
async function fetchBlindTitles(browser) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const titles = [];
  try {
    await page.goto('https://www.teamblind.com/kr/topics/%EC%A3%BC%EC%8B%9D%C2%B7%ED%88%AC%EC%9E%90', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    const grouped = await page.evaluate(() => {
      const groups = new Map();
      Array.from(document.querySelectorAll('a[href^="/kr/post/"]')).forEach(a => {
        const href = a.getAttribute('href');
        const text = a.textContent.trim();
        if (!groups.has(href)) groups.set(href, []);
        groups.get(href).push(text);
      });
      return Array.from(groups.values());
    });
    const META_RE = /^(NOW|HOT|조회수\d|댓글\d|작성시간)/;
    const HANGUL_OR_ALPHA = /[가-힣a-zA-Z]/;
    grouped.forEach(texts => {
      const titleText = texts.find(t => t && t.length >= 4 && t.length <= 80 && !t.includes('·') && !META_RE.test(t) && HANGUL_OR_ALPHA.test(t));
      if (titleText) titles.push(titleText);
    });
  } catch (e) {
    console.log(`  [블라인드 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  return Array.from(new Set(titles));
}

// ── 날짜별 백필 공용 크롤러 (뽐뿌/클리앙/아카라이브/더쿠) ─────────────────
// 각 사이트마다 페이지 구조/날짜 표기 형식이 달라서 extractRows(브라우저 evaluate에서
// {title, raw} 배열 추출)와 parseDate(raw 문자열 -> "YYYY-MM-DD" 또는 null, Node
// 쪽에서 실행) 를 사이트별로 주입받는다. 목록이 최신순(페이지 내 마지막 항목이 그
// 페이지에서 가장 오래된 글)이라는 전제로, 가장 오래된 목표 날짜를 지나치면 멈춘다.
async function crawlTitlesByDate(browser, targetDates, { buildUrl, extractRows, parseDate, label, delay, maxPages }) {
  const context = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
  const page = await context.newPage();
  const byDate = {};
  targetDates.forEach(d => { byDate[d] = []; });
  const earliest = [...targetDates].sort()[0];
  const pageLimit = maxPages || 200;

  try {
    for (let p = 1; p <= pageLimit; p++) {
      await page.goto(buildUrl(p), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(delay || 600);
      const raw = await page.evaluate(extractRows);
      if (!raw || raw.length === 0) continue;
      const rows = raw.map(r => ({ title: r.title, date: parseDate(r.raw) })).filter(r => r.title && r.date);
      if (rows.length === 0) continue;
      rows.forEach(r => { if (byDate[r.date]) byDate[r.date].push(r.title); });
      const oldestOnPage = rows.map(r => r.date).sort()[0];
      if (oldestOnPage < earliest) break;
    }
  } catch (e) {
    console.log(`  [${label} 백필 실패] ${e.message}`);
  } finally {
    await context.close();
  }
  Object.keys(byDate).forEach(d => { byDate[d] = Array.from(new Set(byDate[d])); });
  return byDate;
}

function fetchPpomppuTitlesByDate(browser, targetDates) {
  return crawlTitlesByDate(browser, targetDates, {
    label: '뽐뿌',
    maxPages: 1000,
    buildUrl: p => `https://www.ppomppu.co.kr/zboard/zboard.php?id=stock&page=${p}`,
    extractRows: () => Array.from(document.querySelectorAll('tr.baseList')).map(tr => {
      const a = tr.querySelector('a.baseList-title');
      const timeEl = tr.querySelector('.baseList-time');
      const td = timeEl ? timeEl.closest('td') : null;
      return a ? { title: a.textContent.trim(), raw: td ? td.getAttribute('title') : null } : null;
    }).filter(Boolean),
    // "26.08.11 11:04:51" -> "2026-08-11"
    parseDate: raw => {
      if (!raw) return null;
      const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{2})/);
      return m ? `20${m[1]}-${m[2]}-${m[3]}` : null;
    },
  });
}

function fetchClienTitlesByDate(browser, targetDates) {
  return crawlTitlesByDate(browser, targetDates, {
    label: '클리앙',
    buildUrl: p => `https://www.clien.net/service/board/cm_stock?&od=T31&category=0&po=${p - 1}`,
    extractRows: () => Array.from(document.querySelectorAll('.list_item')).map(item => {
      const titleEl = item.querySelector('.subject_fixed');
      const tsEl = item.querySelector('.timestamp');
      return titleEl ? { title: titleEl.textContent.trim(), raw: tsEl ? tsEl.textContent.trim() : null } : null;
    }).filter(Boolean),
    // "2026-08-11 10:53:24" -> "2026-08-11"
    parseDate: raw => (raw ? raw.slice(0, 10) : null),
  });
}

// 주의: 아카라이브 주식 채널은 게시량이 폭증하는 시점(예: 코스피 급등 같은 이벤트 직후)에는
// 페이지당 정보량에 비해 트래픽이 너무 많아서(실측: 하루치 글이 최대 수천 건) 수백~수천
// 페이지를 넘겨도 하루 전 날짜조차 못 지나치는 경우가 있다 - 그래서 백필(backfillCommunityTrendHistory)
// 대상에서는 제외하고 실시간 수집에만 사용한다(2026-08-11 확인 - 그날의 급등 이벤트로 11일치
// 백필 전체가 0건으로 실패했음).
function fetchArcaliveTitlesByDate(browser, targetDates) {
  return crawlTitlesByDate(browser, targetDates, {
    label: '아카라이브',
    maxPages: 300,
    buildUrl: p => `https://arca.live/b/stock?p=${p}`,
    extractRows: () => Array.from(document.querySelectorAll('a.vrow.column')).map(a => {
      const t = a.querySelector('.title');
      const timeEl = a.querySelector('time');
      const title = t ? t.textContent.replace(/\s+/g, ' ').trim() : null;
      return title ? { title, raw: timeEl ? timeEl.getAttribute('datetime') : null } : null;
    }).filter(Boolean),
    // datetime 속성은 UTC(...Z) - 이 컴퓨터의 로컬 시간대(Asia/Seoul)로 변환해서 날짜만 취함
    parseDate: raw => {
      if (!raw) return null;
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : localDateKey(d);
    },
  });
}

function fetchTheqooTitlesByDate(browser, targetDates) {
  const thisYear = new Date().getFullYear();
  return crawlTitlesByDate(browser, targetDates, {
    label: '더쿠',
    maxPages: 1500,
    buildUrl: p => (p === 1 ? 'https://theqoo.net/stock' : `https://theqoo.net/stock?page=${p}`),
    extractRows: () => Array.from(document.querySelectorAll('table tr'))
      .filter(tr => !tr.className.includes('notice'))
      .map(tr => {
        const a = tr.querySelector('.title a');
        const timeEl = tr.querySelector('.time');
        return a ? { title: a.textContent.trim(), raw: timeEl ? timeEl.textContent.trim() : null } : null;
      }).filter(Boolean),
    // 오늘 글은 "HH:MM"(콜론 포함), 그 이전 글은 "MM.DD"(연도 없음 - 같은 해로 가정)
    parseDate: raw => {
      if (!raw) return null;
      if (raw.includes(':')) return todayKey();
      const m = raw.match(/^(\d{2})\.(\d{2})$/);
      return m ? `${thisYear}-${m[1]}-${m[2]}` : null;
    },
  });
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  // 주어진 커뮤니티 글에 해당 주제(특히 브랜드 특정 조사)가 전혀 없으면, 형식 지시를
  // 어기고 "관련 내용을 찾을 수 없습니다" 같은 순수 텍스트로만 답하는 경우가 있다 - 이건
  // 진짜 오류가 아니라 "찾은 게 없다"는 정상적인 결과이므로 빈 keywords로 취급한다.
  if (start === -1 || end === -1) {
    console.log(`  [참고] JSON 형식 없이 응답함(관련 내용 없음으로 처리): ${text.slice(0, 80)}`);
    return { keywords: [] };
  }
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
  '"reactions": [{"source": "커뮤니티명", "text": "실제로 확인한 반응 요약(명사형 또는 짧은 구문, 20자 내외)"}]}]}\n' +
  '키워드는 최대 15개, 각 키워드당 reactions는 1~3개. text는 "~함", "~라는 반응", "~우려" 같은 명사형/구문으로 짧게 끝내고, ' +
  '완전한 서술형 문장(예: "~라고 말했다")으로 풀어쓰지 마. 실제로 아래 목록에서 확인한 내용 기반으로만 답하고, 근거 없이 지어내지 마. ' +
  '중요: text/keyword/source 값 안에는 큰따옴표(")를 절대 쓰지 마 - 글 제목 등을 인용할 땐 큰따옴표 대신 「」를 쓰거나 그냥 풀어서 써줘 ' +
  '(큰따옴표를 이스케이프 안 해서 JSON이 깨지는 문제가 있었음). 줄바꿈 문자도 넣지 말고 한 줄로 이어서 써줘.';

// sourceTitles: [{ label: '커뮤니티명', titles: string[] }, ...] - 웹서치 없이 이 목록만
// 근거로 조사하게 강제한다(2026-08-11: 뉴스/블로그가 섞여 들어오는 문제 때문에 웹서치를
// 완전히 제거하고 실제 커뮤니티 글만 근거로 쓰도록 변경).
async function researchTopicKeywords(scopeLabel, sourceTitles, dateLabel) {
  const available = sourceTitles.filter(s => s.titles && s.titles.length > 0);
  const totalTitles = available.reduce((sum, s) => sum + s.titles.length, 0);
  if (totalTitles < 3) {
    console.log(`  [조사 스킵] 참고할 커뮤니티 글이 부족함(${totalTitles}건)`);
    return { keywords: [] };
  }

  const timeframe = dateLabel
    ? `${dateLabel} 하루 동안(그 날짜 전후로) 실제로 화제였던`
    : '최근(최근 1~2주 이내) 실제로 화제가 되고 있는';
  const sourceNames = available.map(s => s.label).join(', ');
  const materialBlock = available.map(s =>
    `[${s.label}]\n${s.titles.slice(0, 60).map(t => `- ${t}`).join('\n')}`
  ).join('\n\n');

  const prompt = `${scopeLabel}에 대해, 아래 커뮤니티들에서 실제로 ${dateLabel ? `${dateLabel} 전후로` : '최근'} 올라온 글 제목만 근거로 삼아 ${timeframe} 키워드/이슈를 뽑아줘. ` +
    '웹 검색이나 뉴스/기관/블로그 기사 등 다른 출처는 절대 쓰지 말고, 아래 목록에 있는 내용만 근거로 화제 키워드와 감정, 대표 반응을 뽑아. ' +
    '키워드는 특정 종목명보다는 이슈/테마 단위(예: 수수료 정책, 시장 급락, 특정 이벤트명)를 우선하고, 각 키워드가 커뮤니티에서 ' +
    '긍정적으로 받아들여지는지 부정적으로 받아들여지는지도 판단해줘. reactions의 source 필드에는 반드시 아래 커뮤니티 이름 ' +
    `(${sourceNames}) 중 그 반응이 실제로 나온 커뮤니티 이름을 정확히 그대로 써줘 - 지어내거나 언론사/기관명을 쓰지 마.\n\n` +
    materialBlock + RESEARCH_FORMAT;

  // 웹서치 없이 주어진 커뮤니티 글 목록만 근거로 분류하는 작업이라 웹서치 조사보다는 빠르지만,
  // 소스가 최대 7개까지 합쳐져 자료량이 많을 수 있어 여유있게 3분으로 잡는다.
  const text = await generateInsight(prompt, null, { timeout: 180000, allowWebSearch: false });
  return extractJson(text);
}

// 게재일(실제 글 작성일) 기준 과거 이력 백필/재수집. 날짜별로 디시인사이드/뽐뿌/클리앙/
// 더쿠 실제 글을 모아서 그 날짜 맥락으로 리서치한다(에펨코리아/블라인드/아카라이브는
// 날짜별 백필을 지원하지 않아 제외 - 위 헤더 설명 참고).
//
// opts.dates가 있으면 그 날짜들을 대상으로 하고(daysBack 무시), 없으면 오늘 이전
// daysBack일을 대상으로 한다. opts.force가 true면 이미 history에 있는 날짜도 새 소스로
// 다시 조사해서 덮어쓴다(기본은 false - 이미 채워진 날짜는 건드리지 않음, 라이브 갱신으로
// 채워진 최신 날짜를 실수로 덮어쓰지 않기 위함).
async function backfillCommunityTrendHistory(settings, daysBack, opts) {
  const force = !!(opts && opts.force);
  const outPath = path.join(settings.dataDir, 'community_trend.json');
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : { history: [] };
  const existingDates = new Set((existing.history || []).map(h => h.date));

  let targetDates;
  if (opts && opts.dates) {
    targetDates = [...new Set(opts.dates)];
  } else {
    targetDates = [];
    for (let i = 1; i <= daysBack; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      targetDates.push(localDateKey(d));
    }
  }
  if (!force) targetDates = targetDates.filter(d => !existingDates.has(d));
  if (targetDates.length === 0) {
    console.log('[커뮤니티 반응 백필] 대상 날짜 없음(이미 전부 채워져 있거나 대상이 비어있음)');
    return existing;
  }
  targetDates.sort();

  console.log(`[커뮤니티 반응 백필${force ? ' - 재수집' : ''}] 대상 날짜: ${targetDates.join(', ')}`);
  const browser = await chromium.launch({ headless: true });
  console.log('[커뮤니티 반응 백필] 디시인사이드 글 날짜별 수집 중...');
  const dcByDate = await fetchDcinsideTitlesByDate(browser, targetDates);
  console.log('[커뮤니티 반응 백필] 뽐뿌 글 날짜별 수집 중...');
  const ppomppuByDate = await fetchPpomppuTitlesByDate(browser, targetDates);
  console.log('[커뮤니티 반응 백필] 클리앙 글 날짜별 수집 중...');
  const clienByDate = await fetchClienTitlesByDate(browser, targetDates);
  console.log('[커뮤니티 반응 백필] 더쿠 글 날짜별 수집 중...');
  const theqooByDate = await fetchTheqooTitlesByDate(browser, targetDates);
  await browser.close();

  targetDates.forEach(d => console.log(
    `  ${d}: 디시 ${dcByDate[d].length} / 뽐뿌 ${ppomppuByDate[d].length} / 클리앙 ${clienByDate[d].length} / ` +
    `더쿠 ${theqooByDate[d].length}건`
  ));

  const history = (existing.history || []).filter(h => !targetDates.includes(h.date));
  for (const date of targetDates) {
    const sourceTitles = [
      { label: '디시인사이드 주식 갤러리', titles: dcByDate[date] || [] },
      { label: '뽐뿌 증권포럼', titles: ppomppuByDate[date] || [] },
      { label: '클리앙 주식한담', titles: clienByDate[date] || [] },
      { label: '더쿠 주식', titles: theqooByDate[date] || [] },
    ];
    console.log(`[커뮤니티 반응 백필] ${date} 조사 중...`);
    let generalKeywords = [];
    let brandKeywords = [];
    try {
      const general = await researchTopicKeywords('한국 주식/증권/투자 시장 전반', sourceTitles, date);
      generalKeywords = (general.keywords || []).slice(0, TOP_N);
    } catch (e) {
      console.error(`  [${date}] 시장 전체 조사 실패:`, e.message);
    }
    try {
      const brand = await researchTopicKeywords('메리츠증권(증권사)과 직접 관련된 주제', sourceTitles, date);
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

  console.log('[커뮤니티 반응] 뽐뿌 증권포럼 수집 중...');
  const ppomppuTitles = await fetchPpomppuTitles(browser, 2);
  console.log(`[커뮤니티 반응] 뽐뿌 글 제목 ${ppomppuTitles.length}건 확보`);

  console.log('[커뮤니티 반응] 클리앙 주식한담 수집 중...');
  const clienTitles = await fetchClienTitles(browser, 2);
  console.log(`[커뮤니티 반응] 클리앙 글 제목 ${clienTitles.length}건 확보`);

  console.log('[커뮤니티 반응] 아카라이브 주식 채널 수집 중...');
  const arcaliveTitles = await fetchArcaliveTitles(browser, 2);
  console.log(`[커뮤니티 반응] 아카라이브 글 제목 ${arcaliveTitles.length}건 확보`);

  console.log('[커뮤니티 반응] 더쿠 주식 수집 중...');
  const theqooTitles = await fetchTheqooTitles(browser, 2);
  console.log(`[커뮤니티 반응] 더쿠 글 제목 ${theqooTitles.length}건 확보`);

  console.log('[커뮤니티 반응] 블라인드 주식·투자 수집 중...');
  const blindTitles = await fetchBlindTitles(browser);
  console.log(`[커뮤니티 반응] 블라인드 글 제목 ${blindTitles.length}건 확보`);

  await browser.close();

  const sourceTitles = [
    { label: '디시인사이드 주식 갤러리', titles: dcinsideTitles },
    { label: '에펨코리아 주식 게시판', titles: fmkoreaTitles },
    { label: '뽐뿌 증권포럼', titles: ppomppuTitles },
    { label: '클리앙 주식한담', titles: clienTitles },
    { label: '아카라이브 주식 채널', titles: arcaliveTitles },
    { label: '더쿠 주식', titles: theqooTitles },
    { label: '블라인드 주식·투자', titles: blindTitles },
  ];

  // 조사가 실패했을 때 빈 배열로 어제자 데이터를 덮어써버리면 이미 성공적으로 저장된
  // 데이터가 통째로 날아간다(실제로 한 번 이렇게 날려먹은 적 있음) - 실패 시엔
  // 기존 저장값이 있으면 그걸 그대로 유지한다.
  const outPath = path.join(settings.dataDir, 'community_trend.json');
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : { history: [] };
  const targetDate = yesterdayKey();
  const existingTarget = (existing.history || []).find(h => h.date === targetDate);

  console.log(`[커뮤니티 반응] 시장 전체 화제 키워드 조사 중... (대상: ${targetDate})`);
  let generalKeywords = existingTarget ? existingTarget.general : [];
  try {
    const general = await researchTopicKeywords('한국 주식/증권/투자 시장 전반', sourceTitles, targetDate);
    generalKeywords = (general.keywords || []).slice(0, TOP_N);
  } catch (e) {
    console.error(`[커뮤니티 반응] 시장 전체 조사 실패, ${targetDate} 기존 데이터 유지:`, e.message);
  }

  console.log(`[커뮤니티 반응] 메리츠증권 화제 키워드 조사 중... (대상: ${targetDate})`);
  let brandKeywords = existingTarget ? existingTarget.brand : [];
  try {
    const brand = await researchTopicKeywords('메리츠증권(증권사)과 직접 관련된 주제', sourceTitles, targetDate);
    brandKeywords = (brand.keywords || []).slice(0, TOP_N);
  } catch (e) {
    console.error(`[커뮤니티 반응] 메리츠증권 조사 실패, ${targetDate} 기존 데이터 유지:`, e.message);
  }

  const targetSnapshot = { date: targetDate, general: generalKeywords, brand: brandKeywords };

  const history = (existing.history || []).filter(h => h.date !== targetSnapshot.date);
  history.push(targetSnapshot);
  history.sort((a, b) => a.date.localeCompare(b.date));

  const result = { updatedAt: new Date().toISOString(), history };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[커뮤니티 반응] community_trend.json 갱신 완료 (누적 ${history.length}일치)`);
  return result;
}

module.exports = {
  updateCommunityTrend, backfillCommunityTrendHistory,
  fetchDcinsideTitles, fetchFmkoreaTitles, fetchPpomppuTitles, fetchClienTitles, fetchArcaliveTitles, fetchTheqooTitles, fetchBlindTitles,
  fetchPpomppuTitlesByDate, fetchClienTitlesByDate, fetchArcaliveTitlesByDate, fetchTheqooTitlesByDate,
};
if (require.main === module) {
  const settings = require('../settings.json');
  const arg = process.argv[2];
  if (arg === '--reinforce') {
    // 이미 채워져 있는 날짜들을 새로 추가된 5개 커뮤니티 소스로 다시 조사해서 덮어쓴다.
    const outPath = path.join(settings.dataDir, 'community_trend.json');
    const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : { history: [] };
    const dates = (existing.history || []).map(h => h.date);
    if (dates.length === 0) {
      console.log('[커뮤니티 반응 재수집] history가 비어있어 대상 없음');
    } else {
      backfillCommunityTrendHistory(settings, null, { dates, force: true }).catch(err => { console.error('오류:', err); process.exit(1); });
    }
  } else if (arg) {
    backfillCommunityTrendHistory(settings, parseInt(arg, 10)).catch(err => { console.error('오류:', err); process.exit(1); });
  } else {
    updateCommunityTrend(settings).catch(err => { console.error('오류:', err); process.exit(1); });
  }
}
