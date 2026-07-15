/**
 * 광고 변화 추적기
 * 이전 수집 데이터와 비교해서 신규/종료 광고를 추적
 */

const fs = require('fs');
const path = require('path');

function trackChanges(newItems, existingItems) {
  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);

  // URL 기준 세트 (중복 판단)
  const existingUrls = new Set(existingItems.map(i => i.mediaUrl || i.thumbnailUrl).filter(Boolean));
  const newUrls = new Set(newItems.map(i => i.mediaUrl || i.thumbnailUrl).filter(Boolean));

  // 신규 광고 (새로 나타난 것)
  const newAds = newItems.filter(i => {
    const url = i.mediaUrl || i.thumbnailUrl;
    return url && !existingUrls.has(url);
  }).map(i => ({ ...i, firstSeenAt: now.toISOString(), status: i.status || 'active' }));

  // 종료 광고 (없어진 것) - 24시간 기준
  // existingItems 중 이번 수집에서 안 나타났고, 마지막 수집이 어제 이전인 것
  const endedAds = existingItems.filter(i => {
    const url = i.mediaUrl || i.thumbnailUrl;
    return url && !newUrls.has(url) && i.status !== 'ended' &&
           i.collectedAt && new Date(i.collectedAt) < yesterday;
  }).map(i => ({ ...i, status: 'ended', endedAt: now.toISOString() }));

  return { newAds, endedAds };
}

/**
 * 종료된 광고들을 index 배열에서 status: 'ended'로 업데이트
 */
function applyEndedStatus(existingIndex, endedAds) {
  const endedIds = new Set(endedAds.map(i => i.id).filter(Boolean));
  const endedUrls = new Set(endedAds.map(i => i.mediaUrl || i.thumbnailUrl).filter(Boolean));

  return existingIndex.map(item => {
    const url = item.mediaUrl || item.thumbnailUrl;
    if (endedIds.has(item.id) || (url && endedUrls.has(url))) {
      return { ...item, status: 'ended', endedAt: item.endedAt || new Date().toISOString() };
    }
    return item;
  });
}

function saveSnapshot(dataDir, items) {
  const snapshotPath = path.join(dataDir, 'snapshot.json');
  fs.writeFileSync(snapshotPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    ids: items.map(i => i.mediaUrl || i.thumbnailUrl).filter(Boolean),
  }), 'utf-8');
}

function loadSnapshot(dataDir) {
  const snapshotPath = path.join(dataDir, 'snapshot.json');
  if (!fs.existsSync(snapshotPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  } catch (_) { return null; }
}

module.exports = { trackChanges, applyEndedStatus, saveSnapshot, loadSnapshot };
