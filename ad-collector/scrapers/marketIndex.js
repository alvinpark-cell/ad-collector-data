/**
 * 코스피/코스닥/나스닥 지수 - Yahoo Finance 비공식 차트 API (무료, 키 불필요)
 * ad-ref가 정적 export(output:'export')로 빌드되는 앱이라 실시간 API 라우트를
 * 못 쓴다 - 그래서 다른 데이터들과 동일하게 여기서 받아와 JSON 파일로 저장하고,
 * ad-ref는 그 정적 파일을 그냥 읽기만 한다.
 */

const fs = require('fs');
const path = require('path');

const SYMBOLS = { kospi: '^KS11', kosdaq: '^KQ11', nasdaq: '^IXIC' };

function toLocalDateKey(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 검색어 트렌드(데이터랩) 조회 기간이 1년/1개월 등으로 바뀔 수 있어서, 그때마다 다시
// 받아오는 대신 넉넉하게 1년치를 한 번에 받아 캐싱해두고, 화면(MarketIndexPanel)에서
// 원하는 구간만 잘라 쓰게 한다 (정적 export라 화면에서 그때그때 새로 못 받아옴).
async function fetchOne(key, symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo Finance 응답 오류 (${res.status})`);
  const json = await res.json();
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  const timestamps = (result && result.timestamp) || [];
  const closes = (result && result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];

  const data = timestamps
    .map((ts, i) => ({ date: toLocalDateKey(ts), close: closes[i] }))
    .filter(p => typeof p.close === 'number');

  return { key, symbol, data };
}

async function updateMarketIndex(settings) {
  const results = {};
  for (const [key, symbol] of Object.entries(SYMBOLS)) {
    try {
      results[key] = await fetchOne(key, symbol);
    } catch (e) {
      console.error(`[시장지수] ${key}(${symbol}) 조회 실패:`, e.message);
    }
  }
  const outPath = path.join(settings.dataDir, 'market_index.json');
  fs.writeFileSync(outPath, JSON.stringify({ ...results, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  console.log('[시장지수] market_index.json 갱신 완료:', Object.keys(results).join(', '));
  return results;
}

module.exports = { updateMarketIndex };
if (require.main === module) {
  const settings = require('../settings.json');
  updateMarketIndex(settings).catch(err => { console.error('오류:', err); process.exit(1); });
}
