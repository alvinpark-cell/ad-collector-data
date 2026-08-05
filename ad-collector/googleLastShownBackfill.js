/**
 * 구글 광고 "마지막 게재일"(adLastShownAt) 백필 - google.js는 상세페이지의
 * ".last-shown" 텍스트로 이 값을 파싱하지만, 수집 시점에 아직 게재 중이던 광고는
 * 이 필드 자체가 원본 페이지에 없어서(종료된 광고만 표시됨) 당시엔 null로 남는다.
 * 이후 tracker.js가 그 광고를 status: 'ended'로 넘겨도 상세페이지를 다시 방문하지
 * 않으므로, 구글이 제공하는 정확한 마지막 게재일을 영영 못 채우고 우리 쪽 자체 감지
 * 시각(endedAt)으로만 남는 문제가 있었다(실측 확인 - 2026-08-05, ended 43건 중 26건
 * 이 adLastShownAt 없이 남아있었음). 이 스크립트는 종료 처리된 뒤 상세페이지를 다시
 * 방문해 그 값을 채운다.
 */

const path = require('path');
const { chromium } = require('playwright');
const { loadIndex, saveIndex } = require('./utils');

const MIN_DELAY_MS = 2000;
const DELAY_JITTER_MS = 1500;

async function backfillLastShown(settings, maxPerRun = Infinity) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const index = loadIndex(indexPath);
  const candidates = index.filter(i =>
    i.platform === 'google' && i.status === 'ended' && !i.adLastShownAt && i.detailsLink
  );
  const targets = candidates.slice(0, maxPerRun);

  console.log(`[구글 게재일 백필] 대상 ${candidates.length}건 중 이번 실행에서 ${targets.length}건 시도`);
  if (targets.length === 0) return { success: 0, fail: 0, remaining: 0 };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
  });

  let success = 0, fail = 0;

  try {
    for (let n = 0; n < targets.length; n++) {
      const item = targets[n];
      const page = await context.newPage();
      try {
        await page.goto(item.detailsLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('.last-shown, [class*="last-shown"]', { timeout: 5000 }).catch(() => {});
        const lastShownText = await page.evaluate(() => {
          const el = document.querySelector('.last-shown, [class*="last-shown"]');
          return el ? (el.innerText || '') : '';
        });
        const match = lastShownText.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
        if (match) {
          item.adLastShownAt = match[1] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[3]).padStart(2, '0');
          success++;
        } else {
          fail++;
          console.log(`  ⚠ ${item.id} 상세페이지에서 마지막 게재일을 못 찾음`);
        }
      } catch (e) {
        fail++;
        console.log(`  [실패] ${item.id}: ${e.message}`);
      } finally {
        await page.close();
      }

      if ((n + 1) % 10 === 0) {
        saveIndex(indexPath, index);
        console.log(`  ...진행 ${n + 1}/${targets.length} (중간 저장 완료)`);
      }

      const delay = MIN_DELAY_MS + Math.random() * DELAY_JITTER_MS;
      await new Promise(r => setTimeout(r, delay));
    }
  } finally {
    await browser.close();
  }

  saveIndex(indexPath, index);
  console.log(`[구글 게재일 백필] 완료 - 성공 ${success}건, 실패 ${fail}건 (남은 대상: ${candidates.length - targets.length}건)`);
  return { success, fail, remaining: candidates.length - targets.length };
}

module.exports = { backfillLastShown };
if (require.main === module) {
  const settings = require('./settings.json');
  const maxArg = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  backfillLastShown(settings, maxArg).catch(err => { console.error('오류:', err); process.exit(1); });
}
