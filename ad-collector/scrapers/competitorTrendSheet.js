/**
 * 경쟁사 동향 시트(타임보드/스페셜DA/유튜브/ATL 4탭)를 CSV로 받아와
 * competitor_trend_report.json에 반영한다. 시트가 "링크가 있는 모든 사용자에게 공개"로
 * 설정돼 있어서 트렌드 리포트와 동일하게 별도 인증 없이 export URL로 바로 읽을 수 있다 -
 * 읽기는 이 방식으로 충분하고, 앱스스크립트(CompetitorTrendCode.gs)는 나중에 저희 쪽
 * 자동화(타임보드 캡처, 유튜브 API)가 시트에 "쓸" 때만 필요하다.
 *
 * 시트가 항상 최신 기준이라, 이 소스로 채워진 기존 batch는 매번 통째로 지우고 지금
 * 시트 내용으로 교체한다(시트에서 행을 지우거나 고치면 대시보드에도 그대로 반영됨).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SHEET_ID = '11Ju3THj2RysQ_tq9s_AyTvur7m42bzDp-_a1By7rmq0';
const REPORT_PATH = path.join(__dirname, '..', 'data', 'competitor_trend_report.json');
const SOURCE_TYPE = 'sheet-sync';

function csvUrl(tabName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
}

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return fetchText(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`구글 시트 응답 오류: HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

async function fetchTab(tabName) {
  try {
    const csv = await fetchText(csvUrl(tabName));
    return parseCsv(csv);
  } catch (err) {
    console.error(`[경쟁사 동향 시트] "${tabName}" 탭 읽기 실패:`, err.message);
    return [];
  }
}

// 시트 헤더가 "브랜드"/"브랜드 명", "이미지URL"/"이미지 URL"처럼 팀마다 띄어쓰기나
// 표현이 다르게 들어올 수 있어서, 후보 이름 중 공백 무시하고 매칭되는 첫 값을 찾는다.
function pick(row, ...aliases) {
  const targets = aliases.map((a) => a.replace(/\s+/g, ''));
  const key = Object.keys(row).find((k) => targets.includes(k.replace(/\s+/g, '')));
  return key ? row[key] : undefined;
}

// 시트 "날짜"/"게시월" 칸이 "2026-07-21", "2026.07.21", "2026-07" 등으로 들어올 수 있어서
// 최대한 YYYY-MM-DD로 맞추고, 월만 있으면 1일로 채운다.
function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\./g, '-').replace(/-$/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function timeboardFindings(rows, media) {
  return rows
    .map((r) => ({
      brand: pick(r, '브랜드', '브랜드명'),
      media,
      detail: `${media} 노출${pick(r, '시간') ? ` (${pick(r, '시간')})` : ''}`,
      date: normalizeDate(pick(r, '날짜')),
      url: pick(r, 'URL') || undefined,
      imageUrl: pick(r, '이미지URL', '이미지') || undefined,
    }))
    .filter((f) => f.brand && f.date);
}

function youtubeFindings(rows) {
  return rows
    .map((r) => {
      const views = pick(r, '조회수');
      const avg = pick(r, '1개월평균조회수', '평균조회수');
      return {
        brand: pick(r, '브랜드', '브랜드명'),
        media: '유튜브',
        detail: `${pick(r, '영상제목', '제목')}${views ? ` (조회수 ${views}, 1개월평균 ${avg || '-'})` : ''}`,
        date: normalizeDate(pick(r, '게시월', '날짜')),
        url: pick(r, 'URL') || undefined,
      };
    })
    .filter((f) => f.brand && f.date);
}

function atlFindings(rows) {
  return rows
    .map((r) => ({
      brand: pick(r, '브랜드', '브랜드명'),
      media: 'ATL',
      detail: pick(r, '제목'),
      date: normalizeDate(pick(r, '날짜')),
      url: pick(r, 'URL') || undefined,
    }))
    .filter((f) => f.brand && f.date);
}

async function updateCompetitorTrendSheet() {
  const [timeboard, specialDa, youtube, atl] = await Promise.all([
    fetchTab('타임보드'),
    fetchTab('스페셜DA'),
    fetchTab('유튜브'),
    fetchTab('ATL'),
  ]);

  const findings = [
    ...timeboardFindings(timeboard, '타임보드'),
    ...timeboardFindings(specialDa, '스페셜DA'),
    ...youtubeFindings(youtube),
    ...atlFindings(atl),
  ];

  const existing = fs.existsSync(REPORT_PATH) ? JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8')) : [];
  const kept = existing.filter((b) => b.sourceType !== SOURCE_TYPE);
  if (findings.length > 0) {
    kept.push({
      reportDate: new Date().toISOString().slice(0, 10),
      source: '경쟁사 동향 시트(팀 입력)',
      sourceType: SOURCE_TYPE,
      findings,
    });
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(kept, null, 2));
  console.log(`[경쟁사 동향 시트] 동기화 완료 - ${findings.length}건 반영 (타임보드 ${timeboard.length}, 스페셜DA ${specialDa.length}, 유튜브 ${youtube.length}, ATL ${atl.length} 행 읽음)`);
}

module.exports = { updateCompetitorTrendSheet };

if (require.main === module) {
  updateCompetitorTrendSheet().catch((err) => {
    console.error('[경쟁사 동향 시트] 실패:', err);
    process.exit(1);
  });
}
