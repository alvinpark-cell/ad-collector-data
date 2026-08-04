/**
 * 트렌드 리포트 - 팀에서 관리하는 구글 시트(경쟁사 앱별 월간 MAU/신규설치/성별·연령대)를
 * CSV로 받아와 data/trend_report.json으로 저장한다. 시트가 "링크가 있는 모든 사용자에게
 * 공개"로 설정돼 있어서 별도 구글 인증/API 키 없이 export URL로 바로 받을 수 있다 -
 * 다른 정적 데이터(코스피 지수 등)와 동일하게 "수집 스크립트 → JSON → 대시보드가 정적
 * 파일로 읽기" 패턴을 그대로 따른다.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SHEET_ID = '15nFfed0Y4xvIpVjoYbsttfzgSTDns9U5AteBSh_M5Ow';
const GID = '951374949';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

// 시트의 "구분"(짧은 코드) -> 대시보드 전역에서 쓰는 정식 브랜드명
const COMPANY_TO_BRAND = {
  '메리츠': '메리츠증권', '삼성': '삼성증권', '미래': '미래에셋증권', 'NH': 'NH투자증권',
  'KB': 'KB증권', '신한': '신한투자증권', '한투': '한국투자증권', '키움': '키움증권', '토스': '토스증권',
};

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
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
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// 시트에 큰따옴표로 감싼 값(쉼표 포함)이 안 나와서 단순 파서로 충분함
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

// 시트 위쪽에 그룹 라벨용 병합 셀 행이 몇 줄 있어서(기준/MAU/데모 데이터 등), 실제
// 컬럼명("Y","M","구분"...)이 있는 줄을 찾아서 그 줄부터 헤더로 쓴다.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const headerIdx = lines.findIndex(l => {
    const cells = splitCsvLine(l).map(c => c.trim());
    return cells.includes('Y') && cells.includes('구분');
  });
  if (headerIdx === -1) return [];
  const headers = splitCsvLine(lines[headerIdx]).map(h => h.trim());
  return lines.slice(headerIdx + 1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

// MAU/신규설치 값이 "184,288"처럼 천단위 콤마가 들어간 채로 오기 때문에 지우고 파싱
function toNum(v) {
  const n = parseFloat(String(v || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function updateTrendReport(settings) {
  const csv = await fetchText(CSV_URL);
  const rows = parseCsv(csv);

  const records = rows
    .filter(r => r['Y'] && r['M'] && r['구분'])
    .map(r => ({
      year: parseInt(r['Y'], 10),
      month: parseInt(r['M'], 10),
      company: r['구분'],
      brand: COMPANY_TO_BRAND[r['구분']] || r['구분'],
      appName: r['앱 이름'] || '',
      aosMau: toNum(r['AOS MAU']),
      iosMau: toNum(r['iOS MAU']),
      newInstalls: toNum(r['신규 설치']),
      malePct: toNum(r['남성 사용자 비율']),
      femalePct: toNum(r['여성 사용자 비율']),
      age10: toNum(r['10대 이하']),
      age20: toNum(r['20대']),
      age30: toNum(r['30대']),
      age40: toNum(r['40대']),
      age50: toNum(r['50대']),
      age60: toNum(r['60대 이상']),
    }))
    .filter(r => r.year && r.month);

  const result = { updatedAt: new Date().toISOString(), records };
  const outPath = path.join(settings.dataDir, 'trend_report.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[트렌드 리포트] ${records.length}행 저장 완료 (data/trend_report.json)`);
  return result;
}

module.exports = { updateTrendReport };
if (require.main === module) {
  const settings = require('../settings.json');
  updateTrendReport(settings).catch(err => { console.error('[트렌드 리포트] 오류:', err.message); process.exit(1); });
}
