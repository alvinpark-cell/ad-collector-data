/**
 * 경쟁사 동향 시트(CompetitorTrendCode.gs 배포)에 자동 수집 결과를 한 행씩 쓰는 공용 헬퍼.
 * 읽기는 공개 CSV로 인증 없이 되지만, 쓰기는 이 앱스스크립트 웹앱을 거쳐야 한다.
 */

const https = require('https');
const { URL } = require('url');

function postRow(webAppUrl, tab, row) {
  return new Promise((resolve, reject) => {
    if (!webAppUrl || webAppUrl.includes('여기에_')) {
      return resolve({ skipped: true });
    }
    const body = JSON.stringify({ tab, row });
    const url = new URL(webAppUrl);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        // 앱스스크립트 웹앱은 POST 응답도 302로 실제 결과 URL로 리다이렉트하는데, https.request는
        // 자동으로 안 따라가므로 리다이렉트 자체를 "성공"으로 간주한다(실제 실패는 4xx/5xx로 옴).
        if (res.statusCode >= 200 && res.statusCode < 400) return resolve({ success: true });
        reject(new Error(`시트 쓰기 실패: HTTP ${res.statusCode} ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { postRow };
