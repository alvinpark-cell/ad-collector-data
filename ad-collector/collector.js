const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const settings = require('./settings.json');
const { scrapeMeta } = require('./scrapers/meta');
const { scrapeGoogle } = require('./scrapers/google');
const { scrapeNaverBrandsearch } = require('./scrapers/naverBrandsearch');
const { computePHash, isDuplicate, downloadImage, loadIndex, saveIndex, buildFilename } = require('./utils');
const { generateSite } = require('./generateSite');
const { generateBrandsearchSite } = require('./generateBrandsearch');
const { trackChanges, applyEndedStatus, saveSnapshot } = require('./scrapers/tracker');

const INDEX_PATH = path.join(settings.dataDir, 'index.json');
const BS_INDEX_PATH = path.join(settings.dataDir, 'bs_index.json');
const HASH_PATH = path.join(settings.dataDir, 'hashes.json');

/**
 * ffmpeg 없을 때 Playwright로 로컬 mp4 파일의 첫 프레임을 캡처
 */
async function capturePlaywrightVideoFrame(videoPath, thumbPath) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
    const videoUrl = 'file://' + path.resolve(videoPath).replace(/\\/g, '/');

    await page.setContent(`
      <video id="v" src="${videoUrl}" muted style="width:640px;height:640px;object-fit:cover"></video>
    `);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const v = document.getElementById('v');
        const onSeeked = () => { resolve(); };
        v.addEventListener('seeked', onSeeked, { once: true });
        v.currentTime = 0.5;
        // 메타데이터 로드 대기 후 시도
        if (v.readyState < 1) {
          v.addEventListener('loadedmetadata', () => { v.currentTime = 0.5; }, { once: true });
        }
        setTimeout(resolve, 3000); // 안전장치
      });
    });
    await page.waitForTimeout(300);

    const videoEl = await page.$('#v');
    if (videoEl) {
      await videoEl.screenshot({ path: thumbPath });
      await browser.close();
      return fs.existsSync(thumbPath);
    }
    await browser.close();
    return false;
  } catch (_) {
    if (browser) await browser.close().catch(() => {});
    return false;
  }
}

async function collect() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('광고 수집 시작: ' + new Date().toLocaleString('ko-KR'));
  console.log('========================================\n');

  [settings.dataDir, settings.outputDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  ['meta', 'google'].forEach(platform => {
    ['', 'videos'].forEach(sub => {
      const dir = path.join(settings.outputDir, 'images', platform, sub);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  });

  const existingIndex = loadIndex(INDEX_PATH);
  const existingBsIndex = loadIndex(BS_INDEX_PATH);
  const existingHashes = loadIndex(HASH_PATH);
  console.log('기존 항목: ' + existingIndex.length + '개 (브검: ' + existingBsIndex.length + '개)\n');

  // Meta 수집
  let allRaw = [];
  try {
    console.log('[Meta] 수집 시작');
    const metaResults = await scrapeMeta(settings.keywords, settings.brands, settings);
    allRaw.push(...metaResults);
  } catch (e) { console.error('[Meta] 오류:', e.message); }

  // Google 수집
  try {
    console.log('\n[Google] 수집 시작');
    const googleResults = await scrapeGoogle(settings.keywords, settings.brands, settings);
    allRaw.push(...googleResults);
  } catch (e) { console.error('[Google] 오류:', e.message); }

  console.log('\n총 수집(중복제거 전): ' + allRaw.length + '개');

  const newItems = [];
  const newHashes = [...existingHashes];

  // fbcdn URL에서 변동되는 토큰을 제거하고 핵심 파일 경로만 추출 (중복 판정용)
  function normalizeUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      // 쿼리 파라미터 제거, 경로만 사용 (fbcdn은 경로에 파일ID 포함)
      return u.origin + u.pathname;
    } catch (_) {
      return url.split('?')[0];
    }
  }

  const existingUrls = new Set(
    existingIndex.map(i => normalizeUrl(i.mediaUrl || i.thumbnailUrl)).filter(Boolean)
  );

  for (const item of allRaw) {
    const rawUrlKey = item.mediaUrl || item.thumbnailUrl;
    if (!rawUrlKey) continue;
    const urlKey = normalizeUrl(rawUrlKey);
    if (existingUrls.has(urlKey)) continue;

    if (item.mediaType === 'image') {
      // 이미지: 다운로드 + pHash 중복 제거
      const filename = buildFilename(item.platform, item.keyword, 'image', 'jpg');
      const imagePath = path.join(settings.outputDir, 'images', item.platform, filename);
      try {
        await downloadImage(item.mediaUrl, imagePath);
        const hash = await computePHash(imagePath);
        if (isDuplicate(hash, newHashes, settings.pHashThreshold)) {
          fs.unlink(imagePath, () => {});
          continue;
        }
        if (hash) newHashes.push(hash);
        item.localPath = path.join('images', item.platform, filename);
      } catch (err) {
        item.localPath = null;
      }
    } else if (item.mediaType === 'video') {
      const isYoutube = (item.thumbnailUrl || '').includes('ytimg') || (item.mediaUrl || '').includes('youtube');
      const isFbcdn = (item.mediaUrl || '').includes('fbcdn') && (item.mediaUrl || '').includes('.mp4');

      if (isFbcdn) {
        // Meta 영상 mp4 직접 저장
        try {
          const filename = buildFilename(item.platform, item.keyword, 'video', 'mp4');
          const videoPath = path.join(settings.outputDir, 'images', item.platform, 'videos', filename);
          await downloadImage(item.mediaUrl, videoPath);
          item.localPath = path.join('images', item.platform, 'videos', filename);
          console.log('  영상 저장: ' + filename);

          // 썸네일 생성: 1) ffmpeg 시도, 2) 실패 시 Playwright로 첫 프레임 캡처
          try {
            const thumbFilename = filename.replace('.mp4', '.jpg');
            const thumbPath = path.join(settings.outputDir, 'images', item.platform, 'video_thumbs', thumbFilename);
            const thumbDir = path.dirname(thumbPath);
            if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

            let thumbCreated = false;
            try {
              execSync(`ffmpeg -y -i "${videoPath}" -ss 00:00:00.5 -vframes 1 "${thumbPath}"`, { stdio: 'ignore', timeout: 10000 });
              if (fs.existsSync(thumbPath)) thumbCreated = true;
            } catch (_) { /* ffmpeg 없음, 다음 방법 시도 */ }

            if (!thumbCreated) {
              thumbCreated = await capturePlaywrightVideoFrame(videoPath, thumbPath);
            }

            if (thumbCreated) {
              item.localThumb = path.join('images', item.platform, 'video_thumbs', thumbFilename);
            }
          } catch (_) {
            // 둘 다 실패해도 영상 자체는 정상 저장됨
          }
        } catch (_) { item.localPath = null; }
      }

      if (isYoutube && item.thumbnailUrl) {
        // 유튜브 썸네일 저장
        try {
          const filename = buildFilename(item.platform, item.keyword, 'image', 'jpg');
          const thumbPath = path.join(settings.outputDir, 'images', item.platform, filename);
          await downloadImage(item.thumbnailUrl, thumbPath);
          item.localThumb = path.join('images', item.platform, filename);
        } catch (_) {}
      } else if (!isFbcdn && item.thumbnailUrl) {
        // 기타 썸네일
        try {
          const filename = buildFilename(item.platform, item.keyword, 'image', 'jpg');
          const thumbPath = path.join(settings.outputDir, 'images', item.platform, filename);
          await downloadImage(item.thumbnailUrl, thumbPath);
          item.localThumb = path.join('images', item.platform, filename);
        } catch (_) {}
      }
    }

    existingUrls.add(urlKey);
    newItems.push(item);
  }

  console.log('신규 항목(중복 제외): ' + newItems.length + '개');

  const updatedIndex = [...existingIndex, ...newItems];
  // 신규/종료 광고 추적
  const { newAds, endedAds } = trackChanges(newItems, existingIndex);

  // 종료된 광고의 status를 index에 반영
  const finalIndex = applyEndedStatus(updatedIndex, endedAds);

  const changesPath = path.join(settings.dataDir, 'changes.json');
  const existingChanges = fs.existsSync(changesPath) ? JSON.parse(fs.readFileSync(changesPath,'utf-8')) : { newAds: [], endedAds: [] };
  const updatedChanges = {
    newAds: [...newAds, ...existingChanges.newAds].slice(0, 500),
    endedAds: [...endedAds, ...existingChanges.endedAds].slice(0, 500),
    lastUpdated: new Date().toISOString(),
  };
  saveIndex(changesPath, updatedChanges);
  saveSnapshot(settings.dataDir, finalIndex);
  saveIndex(INDEX_PATH, finalIndex);
  saveIndex(HASH_PATH, newHashes);
  console.log('신규 광고: ' + newAds.length + '개, 종료 광고: ' + endedAds.length + '개');

  // 네이버 브랜드검색 수집
  let newBsItems = [];
  try {
    console.log('\n[네이버 브랜드검색] 수집 시작');
    const bsResults = await scrapeNaverBrandsearch(settings.brands, settings.outputDir);
    const rawBsItems = bsResults.filter(Boolean);

    // 중복 제거: 같은 브랜드+디바이스의 오늘 날짜 항목이 이미 있으면 스킵
    const todayStr = new Date().toISOString().slice(0, 10); // "2026-07-01"
    const existingKeys = new Set(
      existingBsIndex.map(i => `${i.advertiserName}_${i.device}_${(i.collectedAt||'').slice(0,10)}`)
    );
    newBsItems = rawBsItems.filter(item => {
      const key = `${item.advertiserName}_${item.device}_${todayStr}`;
      if (existingKeys.has(key)) {
        console.log(`[브검 중복 스킵] ${item.advertiserName} ${item.device} (오늘 이미 수집됨)`);
        // 중복이면 캡처된 스크린샷 파일도 삭제
        const fs = require('fs');
        const path = require('path');
        const ssPath = path.join(settings.outputDir, item.localPath);
        if (fs.existsSync(ssPath)) fs.unlink(ssPath, () => {});
        return false;
      }
      return true;
    });

    console.log('[네이버 브랜드검색] ' + newBsItems.length + '개 수집 (중복 ' + (rawBsItems.length - newBsItems.length) + '개 제외)');
  } catch (e) { console.error('[네이버 브랜드검색] 오류:', e.message); }

  const updatedBsIndex = [...existingBsIndex, ...newBsItems];
  saveIndex(BS_INDEX_PATH, updatedBsIndex);

  // HTML 생성
  console.log('\nHTML 페이지 생성 중...');
  generateSite(finalIndex, settings);
  generateBrandsearchSite(updatedBsIndex, settings);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n========================================');
  console.log('완료! (' + elapsed + '초 소요)');
  console.log('  광고: ' + finalIndex.length + '개 (신규: ' + newItems.length + ', 종료: ' + endedAds.length + ')');
  console.log('  브검: ' + updatedBsIndex.length + '개 (신규: ' + newBsItems.length + ')');
  console.log('========================================\n');
}

module.exports = { collect };
if (require.main === module) {
  collect().catch(err => { console.error('오류:', err); process.exit(1); });
}
