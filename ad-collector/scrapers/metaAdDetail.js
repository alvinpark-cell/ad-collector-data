/**
 * Apify가 찾아준 광고 메타데이터(adId)를 받아서 실제 이미지/영상 파일 URL을 추출한다.
 *
 * === 이 파일의 용도가 바뀐 이유 (경위 기록) ===
 * 원래는 Apify가 준 adSnapshotUrl(광고 1건만 렌더링하는 전용 링크)로 방문하려 했으나,
 * 실제 응답엔 그 필드가 비어있었고 자체 생성한 대체 URL(render_ad/?id=)도 404였다.
 * 그래서 원래 방식대로 facebook.com/ads/library/?id=... 페이지를 방문하는데,
 * 이 페이지는 광고 1건만 보여주는 게 아니라 라이브러리 전체 UI(검색창/국기 아이콘 등)를
 * 로드해서 미디어 응답에 UI 리소스가 섞여 들어오는 문제가 있었다 (호스트 필터로 방어).
 *
 * 더 심각한 문제는 이 페이지를 광고 20~30건씩 몰아서(짧은 텀으로 연달아) 방문했더니
 * Facebook이 자동화로 탐지하고 403을 반환하기 시작한 것 — 반면 기존 scrapers/meta.js는
 * 검색어당 1페이지만 열고 정상적인 스크롤 패턴이라 지금까지 차단 없이 잘 동작해왔다.
 *
 * 그래서 이 파일은 이제 "보조/구멍 메우기" 전용으로만 쓴다:
 * - collector.js가 scrapers/meta.js(기존, 안전 검증됨)로 이미 확보한 미디어는 제외하고,
 *   Apify는 찾았는데 기존 스크래퍼가 놓친 것만 골라서 여기로 넘긴다 (adId 기준 대조)
 * - 한 번 실행당 방문 개수 상한(settings.metaDetailMaxVisitsPerRun)을 두고
 * - 요청 사이 텀도 넉넉하게(4~7초, 지터 포함) 둬서 몰아치는 트래픽 패턴 자체를 피한다
 */

const { chromium } = require('playwright');

const MAX_MEDIA_PER_AD = 6;
const DEFAULT_MAX_VISITS_PER_RUN = 10;
const MIN_DELAY_MS = 4000;
const DELAY_JITTER_MS = 3000;

function isRealContentUrl(url) {
  if (!url) return false;
  if (url.includes('profile') || url.includes('avatar') || url.includes('emoji')) return false;
  try {
    const host = new URL(url).hostname;
    // 실제 사진/영상 콘텐츠는 scontent-*.fbcdn.net, video-*.fbcdn.net 호스트에서 옴.
    // static.xx.fbcdn.net 등은 페이지 UI 리소스(아이콘 등) 전용이라 제외.
    return /^(scontent|video)[-.]/.test(host) && host.includes('fbcdn.net');
  } catch (_) {
    return false;
  }
}

async function extractMediaFromAdPage(context, meta) {
  const media = [];
  const seenUrls = new Set();
  const page = await context.newPage();

  page.on('response', (response) => {
    try {
      if (media.length >= MAX_MEDIA_PER_AD) return;
      const url = response.url();
      const ct = response.headers()['content-type'] || '';
      if (seenUrls.has(url) || !isRealContentUrl(url)) return;
      if (ct.startsWith('image/')) {
        seenUrls.add(url);
        media.push({ mediaType: 'image', mediaUrl: url });
      } else if (ct.startsWith('video/') || url.includes('.mp4')) {
        seenUrls.add(url);
        media.push({ mediaType: 'video', mediaUrl: url });
      }
    } catch (_) {}
  });

  try {
    const targetUrl = `https://www.facebook.com/ads/library/?id=${encodeURIComponent(meta.adId)}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    // DOM에서도 img/video src 보강 (네트워크 인터셉트로 못 잡는 경우 대비), 동일하게 호스트 제한
    const domMedia = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('img').forEach((img) => {
        if (img.src && img.naturalWidth > 0 && img.naturalWidth < 100) return; // 아이콘류 배제
        items.push({ mediaType: 'image', mediaUrl: img.src || '' });
      });
      document.querySelectorAll('video').forEach((v) => {
        const src = v.src || (v.querySelector('source') ? v.querySelector('source').src : '');
        items.push({ mediaType: 'video', mediaUrl: src || '' });
      });
      return items;
    });
    domMedia.forEach((m) => {
      if (media.length >= MAX_MEDIA_PER_AD) return;
      if (!m.mediaUrl || seenUrls.has(m.mediaUrl) || !isRealContentUrl(m.mediaUrl)) return;
      seenUrls.add(m.mediaUrl);
      media.push(m);
    });

    if (media.length >= MAX_MEDIA_PER_AD) {
      console.log(`  ⚠ 광고 ${meta.adId} 미디어 개수가 상한(${MAX_MEDIA_PER_AD})에 도달 — 일부만 저장됨`);
    }
  } catch (err) {
    console.error(`  ⚠ 광고(${meta.adId}) 페이지 방문 실패: ${err.message}`);
  } finally {
    await page.close();
  }

  return media;
}

/**
 * 메타데이터 행 배열(adId 포함) → mediaType/mediaUrl까지 채운 최종 행 배열.
 * 호출 전에 이미 scrapers/meta.js가 확보한 adId는 걸러내고 "구멍"만 넘겨야 함
 * (collector.js가 그 필터링을 담당).
 *
 * @param {object[]} adMetaRows
 * @param {number} maxVisitsPerRun - 한 번 실행당 방문할 최대 광고 수 (기본 10)
 */
async function hydrateWithMedia(adMetaRows, maxVisitsPerRun) {
  const cap = maxVisitsPerRun || DEFAULT_MAX_VISITS_PER_RUN;
  const withId = adMetaRows.filter(m => m.adId);
  if (withId.length === 0) return [];

  // 같은 adId 중복 제거 후 상한만큼만 이번 실행에서 방문 (나머지는 다음 실행에서 다시 후보로 잡힘)
  const uniqueById = [];
  const seenIds = new Set();
  for (const m of withId) {
    if (seenIds.has(m.adId)) continue;
    seenIds.add(m.adId);
    uniqueById.push(m);
  }
  const toVisit = uniqueById.slice(0, cap);
  const deferred = uniqueById.length - toVisit.length;
  if (deferred > 0) {
    console.log(`  [Meta/보조] 이번 실행에서 ${toVisit.length}건만 방문, ${deferred}건은 다음 실행으로 미룸 (과도한 요청 방지)`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 800, height: 800 },
  });

  const finalRows = [];

  try {
    for (const meta of toVisit) {
      console.log(`  [상세] 광고 ${meta.adId} (${meta.advertiserName}) 미디어 추출 중...`);
      const mediaList = await extractMediaFromAdPage(context, meta);

      if (mediaList.length === 0) {
        console.log(`  ⚠ 광고 ${meta.adId} 미디어를 찾지 못해 건너뜀`);
      } else {
        mediaList.forEach((m) => {
          finalRows.push({ ...meta, mediaType: m.mediaType, mediaUrl: m.mediaUrl });
        });
      }

      const delay = MIN_DELAY_MS + Math.random() * DELAY_JITTER_MS;
      await new Promise((r) => setTimeout(r, delay)); // 몰아치지 않도록 넉넉하고 불규칙한 텀
    }
  } finally {
    await browser.close();
  }

  return finalRows;
}

module.exports = { hydrateWithMedia, extractMediaFromAdPage, isRealContentUrl };
