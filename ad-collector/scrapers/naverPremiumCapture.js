/**
 * 네이버 타임보드(PC)/스페셜DA(모바일) 캡처 - 둘 다 "시간대 통째 판매"(1시간 단위,
 * 새벽만 4시간 단위) 상품이라 그 시간에 접속하면 누구나 같은 광고를 본다. 매 정시에
 * 스크린샷을 찍고, Claude Vision으로 우리 경쟁사 브랜드가 보이는지 판별해서 잡히면
 * competitor_trend_report.json에 기록한다.
 *
 * 상품소개서 확인 결과(2026-08-13):
 * - 타임보드(PC): 00-04시/04-08시는 4시간 단위 판매, 그 외(08-24시)는 1시간 단위
 * - 스페셜DA(모바일): 1일 21구좌, 기본 1시간 단위
 * -> 정각마다 캡처하면 놓치는 슬롯 없음.
 */

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.join(__dirname, '..', 'data', 'competitor_trend_report.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'output', 'screenshots', 'competitor_trend');
const SOURCE_TYPE = 'naver-capture';

const COMPETITOR_BRANDS = [
  '키움증권', '미래에셋증권', '삼성증권', 'NH투자증권', 'KB증권',
  '한국투자증권', '신한투자증권', '토스증권', '대신증권', '한화투자증권',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestampLabel(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function captureTimeboard(browser, now) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  ensureDir(SCREENSHOT_DIR);
  const imgPath = path.join(SCREENSHOT_DIR, `타임보드_${timestampLabel(now)}.png`);
  await page.screenshot({ path: imgPath, clip: { x: 0, y: 0, width: 1920, height: 400 } });
  await ctx.close();
  return imgPath;
}

async function captureSpecialDa(browser, now) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  await page.goto('https://m.naver.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  ensureDir(SCREENSHOT_DIR);
  const imgPath = path.join(SCREENSHOT_DIR, `스페셜DA_${timestampLabel(now)}.png`);
  await page.screenshot({ path: imgPath, clip: { x: 0, y: 0, width: 390, height: 700 } });
  await ctx.close();
  return imgPath;
}

// Claude Vision으로 스크린샷 판별 - 이미지 경로를 프롬프트에 @멘션으로 붙이면 Claude Code
// CLI가 이미지를 읽어서 함께 분석한다. 결과는 "브랜드명" 또는 "없음"만 나오게 강하게 지시.
function analyzeScreenshot(imgPath) {
  const prompt = `@${imgPath}\n` +
    `이 스크린샷은 네이버 메인 화면 상단 광고 영역입니다. 다음 증권사 광고 중 하나가 보이면 ` +
    `정확히 그 브랜드명만 답하고(예: 키움증권), 어느 것도 안 보이면 "없음"이라고만 답해줘. ` +
    `다른 설명은 절대 붙이지 마.\n대상 브랜드: ${COMPETITOR_BRANDS.join(', ')}`;
  try {
    const out = execFileSync('claude', ['-p', prompt, '--output-format', 'text'], {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 20,
      timeout: 60000,
    });
    return out.trim();
  } catch (err) {
    console.error('[네이버 캡처] Claude Vision 분석 실패:', err.message);
    return null;
  }
}

function appendFinding(media, brand, now, imgPath) {
  const existing = fs.existsSync(REPORT_PATH) ? JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8')) : [];
  let batch = existing.find((b) => b.sourceType === SOURCE_TYPE);
  if (!batch) {
    batch = { reportDate: now.toISOString().slice(0, 10), source: '네이버 캡처(자동)', sourceType: SOURCE_TYPE, findings: [] };
    existing.push(batch);
  }
  batch.findings.push({
    brand,
    media,
    detail: `${media} 노출 (${now.toLocaleTimeString('ko-KR')} 캡처)`,
    date: now.toISOString().slice(0, 10),
    imageUrl: `screenshots/competitor_trend/${path.basename(imgPath)}`,
  });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2));
}

async function runCapture({ test = false } = {}) {
  const now = new Date();
  const browser = await chromium.launch({ headless: true });

  for (const [media, captureFn] of [['타임보드', captureTimeboard], ['스페셜DA', captureSpecialDa]]) {
    try {
      const imgPath = await captureFn(browser, now);
      console.log(`[네이버 캡처] ${media} 스크린샷 완료: ${imgPath}`);
      const result = analyzeScreenshot(imgPath);
      console.log(`[네이버 캡처] ${media} 판별 결과: ${result}`);
      if (result && result !== '없음' && COMPETITOR_BRANDS.some((b) => result.includes(b))) {
        const brand = COMPETITOR_BRANDS.find((b) => result.includes(b));
        appendFinding(media, brand, now, imgPath);
        console.log(`[네이버 캡처] ${media}에서 "${brand}" 발견 - 기록 완료`);
      } else if (test) {
        console.log(`[네이버 캡처] ${media} - 경쟁사 미발견 (테스트 모드라 기록 안 함)`);
      }
    } catch (err) {
      console.error(`[네이버 캡처] ${media} 처리 중 오류:`, err.message);
    }
  }

  await browser.close();
}

module.exports = { runCapture, COMPETITOR_BRANDS };

if (require.main === module) {
  const isTest = process.argv.includes('--test');
  runCapture({ test: isTest }).catch((err) => {
    console.error('[네이버 캡처] 실패:', err);
    process.exit(1);
  });
}
