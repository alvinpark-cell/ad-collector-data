/**
 * 파워링크 주차별 인사이트 - 지난 주 대비 이번 주에 새로 진입한 광고주와 소구점을
 * Claude CLI로 요약해서 data/powerlink_insight.json에 저장한다.
 * 수집 주차 캘린더 바로 아래에 표시하는 용도.
 */

const fs = require('fs');
const path = require('path');
const { loadIndex } = require('../utils');
const { generateInsight, buildInsightPrompt, hasEnoughDataForInsight, NO_INSIGHT_TEXT } = require('../insightClient');

function getMonthWeekKey(dateInput) {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const weekOfMonth = Math.ceil(d.getDate() / 7);
  return `${year}-${month}-W${weekOfMonth}`;
}

function adKey(ad) {
  return `${ad.advertiserName || ''}::${ad.displayUrl || ''}`;
}

async function updatePowerlinkInsight(settings) {
  const indexPath = path.join(settings.dataDir, 'powerlink_index.json');
  const data = loadIndex(indexPath);
  const keywords = Array.from(new Set(data.map(d => d.keyword)));

  const insights = {};

  for (const keyword of keywords) {
    const items = data.filter(d => d.keyword === keyword);
    const weekKeys = Array.from(new Set(items.map(i => getMonthWeekKey(i.collectedAt)))).sort();
    const currentWeek = weekKeys[weekKeys.length - 1];
    const prevWeek = weekKeys[weekKeys.length - 2] || null;

    const currentAds = items
      .filter(i => getMonthWeekKey(i.collectedAt) === currentWeek)
      .flatMap(i => i.ads.map(ad => ({ ...ad, device: i.device })));

    if (!prevWeek) {
      // 아직 비교할 지난 주 데이터가 없는 첫 수집 - 이번 주 현황만 요약
      if (!hasEnoughDataForInsight(currentAds.length)) {
        insights[keyword] = { type: 'first', weekKey: currentWeek, text: NO_INSIGHT_TEXT, updatedAt: new Date().toISOString() };
        continue;
      }
      const prompt = buildInsightPrompt('다음은 네이버 파워링크(검색광고) 목록이야. 어떤 광고주들이 있고, 주로 어떤 내용(소구점)으로 광고하고 있는지 한국어로 정리해줘.');
      try {
        const text = await generateInsight(prompt, currentAds.map(a => ({
          광고주: a.advertiserName, 제목: a.title, 설명: a.description, 기기: a.device,
        })));
        insights[keyword] = { type: 'first', weekKey: currentWeek, text, updatedAt: new Date().toISOString() };
      } catch (e) {
        console.error(`[파워링크 인사이트] "${keyword}" 오류:`, e.message);
      }
      continue;
    }

    const prevAds = items
      .filter(i => getMonthWeekKey(i.collectedAt) === prevWeek)
      .flatMap(i => i.ads.map(ad => ({ ...ad, device: i.device })));

    const prevKeys = new Set(prevAds.map(adKey));
    const newEntrants = currentAds.filter(a => !prevKeys.has(adKey(a)));
    const currentKeys = new Set(currentAds.map(adKey));
    const exited = prevAds.filter(a => !currentKeys.has(adKey(a)));

    if (newEntrants.length === 0 && exited.length === 0) {
      insights[keyword] = { type: 'no-change', weekKey: currentWeek, text: '지난 주 대비 신규 진입/이탈한 광고주가 없습니다.', updatedAt: new Date().toISOString() };
      continue;
    }

    const prompt = buildInsightPrompt('다음은 네이버 파워링크(검색광고)의 지난 주 대비 이번 주 변화(신규 진입/이탈 광고주)야. ' +
      '새로 진입한 광고주가 있다면 어떤 소구점(제목/설명 기반)으로 들어왔는지, 이탈한 광고주가 있다면 뭐였는지 한국어로 정리해줘.');
    try {
      const text = await generateInsight(prompt, {
        신규진입: newEntrants.map(a => ({ 광고주: a.advertiserName, 제목: a.title, 설명: a.description, 기기: a.device })),
        이탈: exited.map(a => ({ 광고주: a.advertiserName, 제목: a.title, 기기: a.device })),
      });
      insights[keyword] = {
        type: 'change', weekKey: currentWeek, prevWeekKey: prevWeek,
        newCount: newEntrants.length, exitedCount: exited.length,
        text, updatedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error(`[파워링크 인사이트] "${keyword}" 오류:`, e.message);
    }
  }

  const outPath = path.join(settings.dataDir, 'powerlink_insight.json');
  fs.writeFileSync(outPath, JSON.stringify(insights, null, 2), 'utf-8');
  console.log('[파워링크 인사이트] powerlink_insight.json 갱신 완료:', Object.keys(insights).join(', '));
  return insights;
}

function brandAdKey(ad) {
  return `${ad.advertiserName || ''}::${ad.displayUrl || ''}`;
}

/**
 * 검색광고 브랜드키워드용 인사이트 - powerlink_brand_index.json(브랜드명으로 검색했을 때
 * 나오는 파워링크 결과 중 그 브랜드 "자신"의 광고만 필터링된 데이터)을 대상으로, 이 브랜드가
 * 어떤 소구점으로 소재를 운영 중인지와 주차별로 소재/순위가 어떻게 바뀌었는지 정리한다.
 */
async function updatePowerlinkBrandInsight(settings) {
  const indexPath = path.join(settings.dataDir, 'powerlink_brand_index.json');
  const data = loadIndex(indexPath);
  const brands = Array.from(new Set(data.map(d => d.brand)));
  const insights = {};

  for (const brand of brands) {
    const items = data.filter(d => d.brand === brand);
    const weekKeys = Array.from(new Set(items.map(i => i.weekKey))).sort();
    const currentWeek = weekKeys[weekKeys.length - 1];
    const prevWeek = weekKeys[weekKeys.length - 2] || null;

    const currentEntries = items.filter(i => i.weekKey === currentWeek);
    const currentAds = currentEntries.flatMap(i => i.ads.map(ad => ({ ...ad, device: i.device })));

    if (currentEntries.length > 0 && currentEntries.every(i => i.status === 'no-ads')) {
      insights[brand] = { type: 'no-ads', weekKey: currentWeek, text: '광고 미집행 중', updatedAt: new Date().toISOString() };
      continue;
    }

    if (!prevWeek) {
      if (!hasEnoughDataForInsight(currentAds.length)) {
        insights[brand] = { type: 'first', weekKey: currentWeek, text: NO_INSIGHT_TEXT, updatedAt: new Date().toISOString() };
        continue;
      }
      const prompt = buildInsightPrompt(
        `다음은 "${brand}"가 "${brand}" 키워드로 직접 운영 중인 파워링크 광고 목록이야(순위/제목/설명/서브링크/기기 포함). ` +
        '어떤 소구점(제목/설명/서브링크 기반)으로 광고 중인지, 소재가 몇 개나 있고 기기별로 순위가 어떤지를 중심으로 한국어로 정리해줘.'
      );
      try {
        const text = await generateInsight(prompt, currentAds.map(a => ({
          순위: a.rank, 광고주: a.advertiserName, 제목: a.title, 설명: a.description,
          서브링크: (a.sublinks || []).map(s => s.title).join(', '), 기기: a.device,
        })));
        insights[brand] = { type: 'first', weekKey: currentWeek, text, updatedAt: new Date().toISOString() };
      } catch (e) {
        console.error(`[검색광고 브랜드키워드 인사이트] "${brand}" 오류:`, e.message);
      }
      continue;
    }

    const prevEntries = items.filter(i => i.weekKey === prevWeek);
    const prevAds = prevEntries.flatMap(i => i.ads.map(ad => ({ ...ad, device: i.device })));

    const prevRankByKey = new Map(prevAds.map(a => [brandAdKey(a), a.rank]));
    const currentKeys = new Set(currentAds.map(brandAdKey));
    const prevKeys = new Set(prevAds.map(brandAdKey));
    const newEntrants = currentAds.filter(a => !prevKeys.has(brandAdKey(a)));
    const exited = prevAds.filter(a => !currentKeys.has(brandAdKey(a)));
    const rankChanges = currentAds
      .filter(a => prevRankByKey.has(brandAdKey(a)))
      .map(a => ({ advertiserName: a.advertiserName, prevRank: prevRankByKey.get(brandAdKey(a)), currentRank: a.rank }))
      .filter(r => r.prevRank !== r.currentRank);

    if (newEntrants.length === 0 && exited.length === 0 && rankChanges.length === 0) {
      insights[brand] = { type: 'no-change', weekKey: currentWeek, text: '지난 주 대비 소재/순위 변화가 없습니다.', updatedAt: new Date().toISOString() };
      continue;
    }

    const prompt = buildInsightPrompt(
      `다음은 "${brand}"가 "${brand}" 키워드로 직접 운영 중인 파워링크 광고의 지난 주 대비 이번 주 변화야 ` +
      '(새로 노출된 소재/더 이상 안 보이는 소재/순위변동 포함). 새로 노출된 소재는 어떤 소구점을 쓰는지, ' +
      '순위가 어떻게 바뀌었는지를 중심으로 한국어로 정리해줘.'
    );
    try {
      const text = await generateInsight(prompt, {
        신규소재: newEntrants.map(a => ({ 제목: a.title, 설명: a.description, 순위: a.rank, 기기: a.device })),
        노출종료: exited.map(a => ({ 제목: a.title, 기기: a.device })),
        순위변동: rankChanges,
      });
      insights[brand] = {
        type: 'change', weekKey: currentWeek, prevWeekKey: prevWeek,
        newCount: newEntrants.length, exitedCount: exited.length,
        text, updatedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error(`[검색광고 브랜드키워드 인사이트] "${brand}" 오류:`, e.message);
    }
  }

  const outPath = path.join(settings.dataDir, 'powerlink_brand_insight.json');
  fs.writeFileSync(outPath, JSON.stringify(insights, null, 2), 'utf-8');
  console.log('[검색광고 브랜드키워드 인사이트] powerlink_brand_insight.json 갱신 완료:', Object.keys(insights).join(', '));
  return insights;
}

module.exports = { updatePowerlinkInsight, updatePowerlinkBrandInsight };
if (require.main === module) {
  const settings = require('../settings.json');
  updatePowerlinkInsight(settings).catch(err => { console.error('오류:', err); process.exit(1); });
}
