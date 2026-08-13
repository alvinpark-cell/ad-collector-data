/**
 * 경쟁사 동향 시트(타임보드/스페셜DA/유튜브/ATL 4탭)를 앱스스크립트 웹앱(CompetitorTrendCode.gs)
 * 으로 읽어와 competitor_trend_report.json에 반영한다.
 *
 * (2026-08-13: 처음엔 구글 시트 공개 CSV export(gviz)로 읽었는데, 그 엔드포인트가 캐시를
 * 꽤 오래 들고 있어서 방금 쓴 내용이 몇 분간 옛 스냅샷으로 보이는 문제가 있었음 - 이미
 * 쓰기용으로 앱스스크립트를 쓰고 있으니, 읽기도 같은 앱스스크립트의 list_all로 통일해서
 * 캐싱 문제 자체를 없앰.)
 *
 * 시트가 항상 최신 기준이라, 이 소스로 채워진 기존 batch는 매번 통째로 지우고 지금
 * 시트 내용으로 교체한다(시트에서 행을 지우거나 고치면 대시보드에도 그대로 반영됨).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPORT_PATH = path.join(__dirname, '..', 'data', 'competitor_trend_report.json');
const SOURCE_TYPE = 'sheet-sync';

function fetchJson(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return fetchJson(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`앱스스크립트 응답 오류: HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('JSON 파싱 실패: ' + body.slice(0, 200))); }
      });
    }).on('error', reject);
  });
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

async function updateCompetitorTrendSheet(settings) {
  settings = settings || require('../settings.json');
  const webAppUrl = settings.competitorSheetWebAppUrl;
  if (!webAppUrl || webAppUrl.includes('여기에_')) {
    console.log('[경쟁사 동향 시트] competitorSheetWebAppUrl 미설정 - 건너뜀');
    return;
  }

  const data = await fetchJson(`${webAppUrl}?action=list_all`);
  if (data.error) throw new Error(data.error);

  const timeboard = data['타임보드'] || [];
  const specialDa = data['스페셜DA'] || [];
  const youtube = data['유튜브'] || [];
  const atl = data['ATL'] || [];

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
