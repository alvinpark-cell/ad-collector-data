/**
 * 경쟁사 유튜브 채널 동향 - YouTube Data API v3로 각 브랜드 공식 채널의 최근 업로드를
 * 가져와서, 화제성 있는 이번 달 영상만 competitor_trend_report.json에 기록한다.
 *
 * ## 판별 기준(2026-08-13 확정)
 * 그린브릭스(대행사) 리포트의 원래 기준은 "경쟁사 채널 내 공개 영상 중 최근 1개월
 * 평균 조회 대비 높은 영상 체크"였음 - 이를 아래처럼 구체화함:
 * 1. **베이스라인**: 이번 달 바로 이전 1개월(달력 기준)에 올라온 영상들의 조회수 평균.
 *    (이번 달 영상을 베이스라인 계산에 같이 넣으면 비교 대상과 기준이 겹쳐서 항상 절반
 *    가까이가 "평균 이상"으로 잡히는 순환 오류가 생김 - 최초 버전에서 발견/수정함.)
 * 2. **채택 기준**: 이번 달 영상 중 베이스라인 평균을 넘는 것들 중, **조회수가 가장
 *    높은 영상 1개만** 브랜드당 채택(2026-08-13 확정 - 평균의 2배 이상 등은 이전
 *    시도였고, 최종적으로는 "평균 이상 중 최다 조회수 1건"으로 단순화함).
 * 3. **예외**: 평균을 넘는 영상이 하나도 없어도 브랜드가 통째로 빠지지 않도록,
 *    이번 달 최다 조회수 영상 1개는 항상 대표로 포함(이번 달 업로드 자체가 없으면 0건).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.join(__dirname, '..', 'data', 'competitor_trend_report.json');
const SOURCE_TYPE = 'youtube-api';

const BRANDS = [
  '키움증권', '미래에셋증권', '삼성증권', 'NH투자증권', 'KB증권',
  '한국투자증권', '신한투자증권', '토스증권', '대신증권', '한화투자증권',
];

// 검색으로 찾은 채널이 매번 바뀌거나 엉뚱한 채널이 잡히는 걸 막기 위해, 한 번 확인된
// 채널ID는 여기 고정해두고 재사용한다. 비어있는 브랜드는 매번 검색 결과 중 브랜드명이
// 채널명에 포함된 첫 결과를 채택한다.
const KNOWN_CHANNEL_IDS = {
  '키움증권': 'UCZW1d7B2nYqQUiTiOnkirrQ', // 채널K by 키움증권
  // 검색 1위였던 "Mirae Asset Securities" 채널은 설명에 "미래에셋 스마트머니로 통합
  // 중"이라고 적혀있고 실제 업로드 재생목록이 비어있어(API 오류) 실사용 채널인
  // "미래에셋 스마트머니"로 고정 (2026-08-13 확인).
  '미래에셋증권': 'UCZS9wEZ4itPbBZk_sqccXfw', // 미래에셋 스마트머니(Smart Money)
};

function apiGet(pathAndQuery) {
  return new Promise((resolve, reject) => {
    https.get(`https://www.googleapis.com/youtube/v3/${pathAndQuery}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) return reject(new Error(json.error.message));
          resolve(json);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// 브랜드명의 핵심 부분(증권/투자증권 등 접미사 제거)이 채널명에 포함돼야 채택 -
// 완전히 무관한 채널이 검색 1위로 잡히는 걸 거르기 위한 최소한의 안전장치.
function looksLikeOfficialChannel(brand, channelTitle) {
  const core = brand.replace(/투자증권|증권|주식회사/g, '').trim();
  return core.length > 0 && channelTitle.includes(core);
}

async function findChannelId(brand, apiKey) {
  if (KNOWN_CHANNEL_IDS[brand]) return KNOWN_CHANNEL_IDS[brand];
  const res = await apiGet(`search?part=snippet&q=${encodeURIComponent(brand)}&type=channel&maxResults=5&key=${apiKey}`);
  const match = (res.items || []).find((i) => looksLikeOfficialChannel(brand, i.snippet.channelTitle));
  return match ? match.id.channelId : null;
}

async function getUploadsPlaylistId(channelId, apiKey) {
  const res = await apiGet(`channels?part=contentDetails&id=${channelId}&key=${apiKey}`);
  return res.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
}

// 이번 달 영상과, 그 이전 몇 달치 "평상시 베이스라인"을 같이 확보해야 해서 최대
// 3페이지(150개)까지 페이지네이션한다 - 채널 업로드 빈도가 낮으면 1페이지 안에서도
// 이미 몇 달 전 영상까지 걸리니 충분하고, 빈도가 높은 채널은 3페이지면 최근 1~2달치는 확보됨.
async function getRecentVideos(playlistId, apiKey, maxPages = 3) {
  const items = [];
  let pageToken = '';
  for (let page = 0; page < maxPages; page++) {
    const res = await apiGet(`playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`);
    items.push(...(res.items || []).map((i) => ({
      videoId: i.snippet.resourceId.videoId,
      title: i.snippet.title,
      publishedAt: i.snippet.publishedAt,
    })));
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return items;
}

// videos.list는 한 번에 최대 50개 ID까지만 받아서, 그 이상이면 50개씩 나눠 호출한다.
async function getVideoStats(videoIds, apiKey) {
  const map = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    if (chunk.length === 0) continue;
    const res = await apiGet(`videos?part=statistics&id=${chunk.join(',')}&key=${apiKey}`);
    (res.items || []).forEach((v) => { map[v.id] = parseInt(v.statistics.viewCount || '0', 10); });
  }
  return map;
}

async function updateYoutubeCompetitorTrend(settings) {
  const apiKey = settings.youtubeApiKey;
  if (!apiKey || apiKey.includes('여기에_')) {
    console.log('[유튜브 경쟁사 동향] youtubeApiKey 미설정 - 건너뜀');
    return;
  }

  const findings = [];
  for (const brand of BRANDS) {
    try {
      const channelId = await findChannelId(brand, apiKey);
      if (!channelId) {
        console.log(`[유튜브 경쟁사 동향] ${brand} - 공식 채널 못 찾음 (건너뜀)`);
        continue;
      }
      const uploadsPlaylist = await getUploadsPlaylistId(channelId, apiKey);
      if (!uploadsPlaylist) continue;
      const videos = await getRecentVideos(uploadsPlaylist, apiKey, 3);
      if (videos.length === 0) continue;
      const stats = await getVideoStats(videos.map((v) => v.videoId), apiKey);
      const withViews = videos.map((v) => ({ ...v, views: stats[v.videoId] || 0 }));

      const now = new Date();
      const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

      // 베이스라인 = 그린브릭스 원래 기준("최근 1개월 평균") 그대로, 이번 달 바로
      // 이전 1개월치만 사용 - 그 이전 여러 달을 섞으면 "1개월 평균"이 아니게 됨.
      const thisMonthVideos = withViews.filter((v) => v.publishedAt.slice(0, 7) === thisMonthKey);
      const baselineVideos = withViews.filter((v) => v.publishedAt.slice(0, 7) === prevMonthKey);

      if (baselineVideos.length === 0) {
        console.log(`[유튜브 경쟁사 동향] ${brand}: 베이스라인(전월 ${prevMonthKey}) 영상이 없어 비교 불가 - 건너뜀`);
        continue;
      }

      const baselineAvg = baselineVideos.reduce((s, v) => s + v.views, 0) / baselineVideos.length;
      // 전월 평균을 넘는 영상 중 조회수가 가장 높은 것 1개만 채택 - 넘는 게 하나도
      // 없어도 브랜드가 통째로 빠지지 않도록 그럴 땐 이번 달 최다 조회수 영상으로 대신함.
      const aboveAverage = thisMonthVideos.filter((v) => v.views > baselineAvg);
      const pool = aboveAverage.length > 0 ? aboveAverage : thisMonthVideos;
      const top = pool.length > 0 ? [...pool].sort((a, b) => b.views - a.views)[0] : null;

      if (top) {
        findings.push({
          brand,
          media: '유튜브',
          detail: `${top.title} (조회수 ${top.views.toLocaleString()}, 전월(${prevMonthKey}) 평균 ${Math.round(baselineAvg).toLocaleString()})`,
          date: top.publishedAt.slice(0, 10),
          url: `https://youtu.be/${top.videoId}`,
        });
      }
      console.log(`[유튜브 경쟁사 동향] ${brand}: 이번달 ${thisMonthVideos.length}개(전월 ${prevMonthKey} ${baselineVideos.length}개, 평균 ${Math.round(baselineAvg)}) 중 평균 초과 ${aboveAverage.length}개 -> ${top ? '1개 채택' : '0개'}`);
    } catch (err) {
      console.error(`[유튜브 경쟁사 동향] ${brand} 처리 실패:`, err.message);
    }
  }

  const existing = fs.existsSync(REPORT_PATH) ? JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8')) : [];
  const kept = existing.filter((b) => b.sourceType !== SOURCE_TYPE);
  if (findings.length > 0) {
    kept.push({
      reportDate: new Date().toISOString().slice(0, 10),
      source: '유튜브 API(자동)',
      sourceType: SOURCE_TYPE,
      findings,
    });
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(kept, null, 2));
  console.log(`[유튜브 경쟁사 동향] 완료 - ${findings.length}건 반영`);
}

module.exports = { updateYoutubeCompetitorTrend };

if (require.main === module) {
  const settings = require('../settings.json');
  updateYoutubeCompetitorTrend(settings).catch((err) => {
    console.error('[유튜브 경쟁사 동향] 실패:', err);
    process.exit(1);
  });
}
