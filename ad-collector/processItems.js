/**
 * 원본 스크래핑 결과(rawItems)를 받아서 data/index.json에 반영하는 공용 처리기.
 * 원래 collector.js의 collect() 안에 있던 로직을 그대로 옮긴 것 — 삭제된 로직 없음.
 *
 * collector.js(하루 1회 전체 수집)와 metaBrandBatch.js(2시간마다 브랜드 배치 수집)가
 * 이 함수를 공유해서 쓴다. 처리 내용:
 * - adId/URL 기준 중복 제거
 * - 이미지 다운로드 + pHash 중복판정
 * - 영상 다운로드 + 썸네일 생성(ffmpeg 우선, 실패시 Playwright 프레임 캡처)
 * - data/index.json, hashes.json, changes.json, snapshot.json 갱신
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const { computePHash, isDuplicate, downloadImage, loadIndex, saveIndex, buildFilename } = require('./utils');
const { trackChanges, applyEndedStatus, saveSnapshot } = require('./scrapers/tracker');
const { isJunkAdvertiser } = require('./brandUtils');

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

// fbcdn URL에서 변동되는 토큰을 제거하고 핵심 파일 경로만 추출 (중복 판정용)
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch (_) {
    return url.split('?')[0];
  }
}

async function processAndSaveItems(rawItems, settings) {
  const INDEX_PATH = path.join(settings.dataDir, 'index.json');
  const HASH_PATH = path.join(settings.dataDir, 'hashes.json');
  const CHANGES_PATH = path.join(settings.dataDir, 'changes.json');

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
  const existingHashes = loadIndex(HASH_PATH);

  const newItems = [];
  const newHashes = [...existingHashes];

  const existingUrls = new Set(
    existingIndex.map(i => normalizeUrl(i.mediaUrl || i.thumbnailUrl)).filter(Boolean)
  );
  // Apify(Meta) 응답의 mediaUrl은 서명된 임시 링크라 실행마다 값이 바뀔 수 있어서
  // URL 비교만으로는 같은 광고가 중복 저장될 수 있음 -> adId(libraryID)로 한 번 더 방어
  const existingAdIds = new Set(existingIndex.map(i => i.adId).filter(Boolean));

  // 중복(이미 index.json에 있는) 광고를 다시 만났을 때 "이번 달에도 여전히 게재 중"임을
  // 기록해두기 위한 조회용 맵 - Meta/Google처럼 월 1회씩만 도는 수집에서, 매번 새 항목으로
  // 안 잡히더라도 "이 소재가 몇 월에 있었는지" 월별 화면에서 파악할 수 있게 함
  const existingByAdId = new Map(existingIndex.filter(i => i.adId).map(i => [i.adId, i]));
  const existingByUrl = new Map(
    existingIndex.map(i => [normalizeUrl(i.mediaUrl || i.thumbnailUrl), i]).filter(([k]) => k)
  );
  const currentMonthKey = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const markSeenThisMonth = (existing) => {
    if (!existing) return;
    if (!Array.isArray(existing.seenInMonths)) existing.seenInMonths = [];
    if (!existing.seenInMonths.includes(currentMonthKey)) existing.seenInMonths.push(currentMonthKey);
  };

  for (const item of rawItems) {
    // "염승환 이사" 같은 인물 사칭 스캠 광고는 광고주명이 "증권"을 포함해도 걸러낸다
    // (allowedAdvertiserPatterns 화이트리스트는 금융 관련 단어 포함 여부만 보기 때문에
    // 이 필터를 통과 못 시킴 - 실제 증권사명은 denylist에 없으므로 영향 없음)
    if (isJunkAdvertiser(item.advertiserName, item.copyText, settings.advertiserDenylist)) continue;

    if (item.adId && existingAdIds.has(item.adId)) {
      markSeenThisMonth(existingByAdId.get(item.adId));
      continue;
    }

    // Apify로 메타데이터만 확보하고 아직 실제 이미지/영상을 못 찾은 "구멍" 항목도
    // adId만 있으면 일단 저장한다(미디어 없이) - 예전엔 미디어 URL이 없으면 여기서
    // 그냥 버려서, Apify 비용 들여 찾은 광고 정보가 시간 안에 상세페이지를 못 들르면
    // 통째로 사라지는 문제가 있었음. adId가 있으면 다음 실행에서 metaAdDetail.js의
    // backfillPendingMedia()가 이 항목을 찾아 미디어를 채워 넣는다.
    const rawUrlKey = item.mediaUrl || item.thumbnailUrl;
    const hasMedia = !!rawUrlKey;
    if (!hasMedia && !item.adId) continue;

    if (hasMedia) {
      const urlKey = normalizeUrl(rawUrlKey);
      if (existingUrls.has(urlKey)) {
        markSeenThisMonth(existingByUrl.get(urlKey));
        continue;
      }
      existingUrls.add(urlKey);
    }

    if (hasMedia && item.mediaType === 'image') {
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
        // 브라우저에 그대로 URL로 쓰이는 경로라 path.join(윈도우에서 백슬래시) 대신 항상 슬래시로 조립
        item.localPath = ['images', item.platform, filename].join('/');
      } catch (err) {
        item.localPath = null;
      }
    } else if (hasMedia && item.mediaType === 'video') {
      const isYoutube = (item.thumbnailUrl || '').includes('ytimg') || (item.mediaUrl || '').includes('youtube');
      const isFbcdn = (item.mediaUrl || '').includes('fbcdn') && (item.mediaUrl || '').includes('.mp4');

      if (isFbcdn) {
        // Meta 영상 mp4 직접 저장
        try {
          const filename = buildFilename(item.platform, item.keyword, 'video', 'mp4');
          const videoPath = path.join(settings.outputDir, 'images', item.platform, 'videos', filename);
          await downloadImage(item.mediaUrl, videoPath);
          item.localPath = ['images', item.platform, 'videos', filename].join('/');
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
              item.localThumb = ['images', item.platform, 'video_thumbs', thumbFilename].join('/');
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
          item.localThumb = ['images', item.platform, filename].join('/');
        } catch (_) {}
      } else if (!isFbcdn && item.thumbnailUrl) {
        // 기타 썸네일
        try {
          const filename = buildFilename(item.platform, item.keyword, 'image', 'jpg');
          const thumbPath = path.join(settings.outputDir, 'images', item.platform, filename);
          await downloadImage(item.thumbnailUrl, thumbPath);
          item.localThumb = ['images', item.platform, filename].join('/');
        } catch (_) {}
      }
    }

    if (item.adId) existingAdIds.add(item.adId);
    item.seenInMonths = [currentMonthKey];
    newItems.push(item);
  }

  const updatedIndex = [...existingIndex, ...newItems];
  const { newAds, endedAds } = trackChanges(newItems, existingIndex);
  const finalIndex = applyEndedStatus(updatedIndex, endedAds);

  const existingChanges = fs.existsSync(CHANGES_PATH) ? JSON.parse(fs.readFileSync(CHANGES_PATH, 'utf-8')) : { newAds: [], endedAds: [] };
  const updatedChanges = {
    newAds: [...newAds, ...existingChanges.newAds].slice(0, 500),
    endedAds: [...endedAds, ...existingChanges.endedAds].slice(0, 500),
    lastUpdated: new Date().toISOString(),
  };
  saveIndex(CHANGES_PATH, updatedChanges);
  saveSnapshot(settings.dataDir, finalIndex);
  saveIndex(INDEX_PATH, finalIndex);
  saveIndex(HASH_PATH, newHashes);

  return { newItems, finalIndex, newAds, endedAds };
}

module.exports = { processAndSaveItems, normalizeUrl, capturePlaywrightVideoFrame };
