/**
 * Meta 이미지 재검증/교정 - 실제 광고 카드와 무관한 이미지가 저장된 항목을 찾아 고친다.
 *
 * 경위: 2026-08-05 세션에서 scrapers/meta.js의 카드 경계(cardEls) 탐지 버그를 고쳤다
 * (예전 셀렉터/preWrap 폴백이 너무 좁아서 광고주명뿐 아니라 이미지도 엉뚱한 카드에서
 * 잡힐 수 있었음 - metaAdDetail.js에서 이미 확인된 것과 같은 버그 종류). 이 버그가
 * 고쳐지기 전에 수집된 기존 레코드(토스증권 등)는 카피/헤드라인과 전혀 안 맞는 이미지가
 * 저장돼있을 수 있어서, adId가 있는 항목은 전부 상세페이지(?id=...)를 다시 방문해
 * (marker 기반으로 정확히 스코프된) 진짜 이미지와 대조하고 다르면 교체한다.
 *
 * 별도로, 같은 세션에서 발견한 "네트워크 인터셉트 폴백"(adId 없이 브랜드명만 붙인
 * 정체불명 항목 - 60x60 프로필 아이콘 등 잡음으로 확인됨)은 이 스크립트가 함께
 * 정리한다 - 애초에 어느 광고에도 못 묶이는 데이터라 재검증이 불가능해서 삭제.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadIndex, saveIndex, downloadImage, computePHash, hammingDistance } = require('./utils');
const { extractMediaFromAdPage } = require('./scrapers/metaAdDetail');

// 광고 하나당 페이지 방문+다운로드+pHash 비교로 몇 초씩 걸려서 전체 실행이 오래 걸리는데,
// 그 사이 스케줄러의 다른 수집 작업이 같은 index.json에 새 항목을 추가할 수 있다. 시작할
// 때 읽어둔 스냅샷을 그대로 저장하면 그 사이 추가된 새 항목이 통째로 사라진다(실측: 다른
// 백필 스크립트가 이 패턴으로 신규 267건을 날린 사고 발생, 2026-08-06). 저장 시점마다
// 파일을 다시 읽어서, 지금까지 교체한 이미지 정보만 id 기준으로 최신 내용에 병합해 저장한다.
function saveRepairsMerged(indexPath, updatedItemsById) {
  const fresh = loadIndex(indexPath);
  fresh.forEach(item => {
    const update = updatedItemsById.get(item.id);
    if (update) item.imageRepairedAt = update.imageRepairedAt;
  });
  saveIndex(indexPath, fresh);
  return fresh;
}

async function removeOrphanFallbackItems(settings) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const index = loadIndex(indexPath);
  const orphans = index.filter(i => i.platform === 'meta' && i.mediaType === 'image' && !i.adId);
  if (orphans.length === 0) return 0;

  orphans.forEach(o => {
    if (o.localPath && !/^https?:\/\//i.test(o.localPath)) {
      const p = path.join(settings.outputDir, o.localPath);
      fs.existsSync(p) && fs.unlinkSync(p);
    }
  });

  const orphanSet = new Set(orphans);
  const cleaned = index.filter(i => !orphanSet.has(i));
  saveIndex(indexPath, cleaned);
  console.log(`[Meta 이미지 재검증] adId 없는 정체불명 항목 ${orphans.length}건 삭제`);
  return orphans.length;
}

async function verifyAndRepairMetaImages(settings, maxPerRun = Infinity) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const index = loadIndex(indexPath);
  const threshold = settings.pHashThreshold || 10;

  const candidates = index.filter(i =>
    i.platform === 'meta' && i.mediaType === 'image' && i.adId && i.localPath &&
    !/^https?:\/\//i.test(i.localPath)
  );
  const targets = candidates.slice(0, maxPerRun);
  console.log(`[Meta 이미지 재검증] 대상 ${candidates.length}건 중 이번 실행에서 ${targets.length}건 재확인`);
  if (targets.length === 0) return { matched: 0, fixed: 0, skipped: 0 };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 800, height: 800 },
  });

  let matched = 0, fixed = 0, skipped = 0;
  const updatedItemsById = new Map();

  try {
    for (let n = 0; n < targets.length; n++) {
      const item = targets[n];
      const currentPath = path.join(settings.outputDir, item.localPath);
      if (!fs.existsSync(currentPath)) { skipped++; continue; }

      let media = [];
      try {
        media = await extractMediaFromAdPage(context, item);
      } catch (e) {
        console.log(`  [방문 실패] ${item.advertiserName}(${item.adId}): ${e.message}`);
        skipped++;
        continue;
      }

      const candidate = media.find(m => m.mediaType === 'image');
      if (!candidate) {
        console.log(`  ⚠ ${item.advertiserName}(${item.adId}) 상세페이지에서 이미지를 못 찾음 - 기존 값 유지, 건너뜀`);
        skipped++;
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
        continue;
      }

      const tmpPath = currentPath + '.verify.jpg';
      try {
        await downloadImage(candidate.mediaUrl, tmpPath);
        const [oldHash, newHash] = await Promise.all([computePHash(currentPath), computePHash(tmpPath)]);
        const dist = hammingDistance(oldHash, newHash);

        if (oldHash && newHash && dist <= threshold) {
          matched++;
          fs.unlinkSync(tmpPath);
        } else {
          fs.copyFileSync(tmpPath, currentPath);
          fs.unlinkSync(tmpPath);
          const imageRepairedAt = new Date().toISOString();
          updatedItemsById.set(item.id, { imageRepairedAt });
          fixed++;
          console.log(`  🔧 교체: ${item.advertiserName}(${item.adId}) - pHash 거리 ${dist}`);
          saveRepairsMerged(indexPath, updatedItemsById);
        }
      } catch (e) {
        console.log(`  [다운로드/비교 실패] ${item.advertiserName}(${item.adId}): ${e.message}`);
        skipped++;
        try { fs.existsSync(tmpPath) && fs.unlinkSync(tmpPath); } catch (_) {}
      }

      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
    }
  } finally {
    await browser.close();
  }

  console.log(`[Meta 이미지 재검증] 완료 - 일치 ${matched}건, 교체 ${fixed}건, 건너뜀 ${skipped}건`);
  return { matched, fixed, skipped };
}

module.exports = { verifyAndRepairMetaImages, removeOrphanFallbackItems };

if (require.main === module) {
  const settings = require('./settings.json');
  const maxArg = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  (async () => {
    await removeOrphanFallbackItems(settings);
    await verifyAndRepairMetaImages(settings, maxArg);
  })().catch(err => { console.error('오류:', err); process.exit(1); });
}
