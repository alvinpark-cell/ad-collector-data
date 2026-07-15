const fs = require('fs');
const path = require('path');

function generateSite(index, settings) {
  const outputDir = settings.outputDir;
  const appsScriptUrl = settings.appsScriptUrl || '';
  const lastUpdated = new Date().toLocaleString('ko-KR');

  const brandSet = new Set([
    ...settings.brands,
    ...index.filter(i => i.searchType === 'brand').map(i => i.advertiserName).filter(Boolean)
  ]);
  const brands = [...brandSet].sort();

  // KPI 집계
  const totalCount = index.length;
  const metaCount = index.filter(i => i.platform === 'meta').length;
  const googleCount = index.filter(i => i.platform === 'google').length;
  const videoCount = index.filter(i => i.mediaType === 'video').length;
  const imageCount = index.filter(i => i.mediaType === 'image').length;
  const today = new Date(); today.setHours(0,0,0,0);
  const newToday = index.filter(i => i.collectedAt && new Date(i.collectedAt) >= today).length;
  const endedCount = index.filter(i => i.status === 'ended').length;
  const activeCount = totalCount - endedCount;

  // 브랜드별 집계
  const brandStats = {};
  brands.forEach(b => {
    const items = index.filter(i => (i.advertiserName||'').includes(b) || (i.keyword||'') === b);
    brandStats[b] = { total: items.length, video: items.filter(i=>i.mediaType==='video').length, image: items.filter(i=>i.mediaType==='image').length };
  });

  const DATA_JSON = JSON.stringify(index);
  const SETTINGS_JSON = JSON.stringify({ appsScriptUrl, brands, keywords: settings.keywords, brandStats });

  // </script> 등 특수문자 이스케이프 후 data.js 저장
  const safeData = JSON.stringify(index).replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--');
  const safeSett = JSON.stringify({ appsScriptUrl, brands, keywords: settings.keywords, brandStats }).replace(/<\/script>/gi, '<\\/script>');
  const dataJs = 'var DATA = ' + safeData + ';\nvar SETTINGS = ' + safeSett + ';';
  fs.writeFileSync(path.join(outputDir, 'data.js'), dataJs, 'utf-8');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AD Ref - 광고 레퍼런스 뷰어</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f0f13; --surface: #1a1a24; --surface2: #22222f; --border: #2e2e3e;
  --accent: #6c63ff; --accent2: #a78bfa; --text: #e2e2f0; --text-sub: #8888aa;
  --meta: #1877f2; --google: #ea4335; --tiktok: #69c9d0; --star: #fbbf24;
  --green: #34d399; --red: #f87171; --card-radius: 12px;
}
body { background: var(--bg); color: var(--text); font-family: -apple-system, 'Segoe UI', sans-serif; min-height: 100vh; }

/* 헤더 */
.header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 100; flex-wrap: wrap; }
.logo { font-size: 17px; font-weight: 700; color: var(--accent2); white-space: nowrap; }
.logo span { color: var(--text-sub); font-size: 11px; font-weight: 400; margin-left: 8px; }
.search-wrap { flex: 1; min-width: 180px; max-width: 380px; position: relative; }
.search-input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 9px 14px 9px 36px; color: var(--text); font-size: 13px; outline: none; }
.search-input:focus { border-color: var(--accent); }
.search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--text-sub); font-size: 14px; pointer-events: none; }
.tabs { display: flex; gap: 4px; margin-left: auto; }
.tab { padding: 7px 13px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-sub); font-size: 12px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* KPI 카드 */
.kpi-bar { padding: 16px 24px; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; border-bottom: 1px solid var(--border); background: var(--surface); }
.kpi-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.kpi-label { font-size: 11px; color: var(--text-sub); }
.kpi-value { font-size: 22px; font-weight: 700; margin-top: 4px; }
.kpi-value.accent { color: var(--accent2); }
.kpi-value.green { color: var(--green); }
.kpi-value.meta { color: #6aadff; }
.kpi-value.google { color: #ff8a80; }

/* 필터 바 */
.filter-bar { padding: 10px 24px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); background: var(--surface); }
.filter-label { font-size: 11px; color: var(--text-sub); white-space: nowrap; }
.filter-chips { display: flex; gap: 5px; flex-wrap: wrap; }
.chip { padding: 3px 10px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text-sub); font-size: 11px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.chip.active { border-color: var(--accent); color: var(--accent2); background: rgba(108,99,255,0.12); }
.divider { width: 1px; height: 18px; background: var(--border); margin: 0 2px; flex-shrink: 0; }
.count-badge { margin-left: auto; font-size: 11px; color: var(--text-sub); white-space: nowrap; }

/* 캘린더 */
.cal-wrap { position: relative; }
.cal-btn { padding: 4px 10px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface2); color: var(--text-sub); font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.cal-btn.active { border-color: var(--accent); color: var(--accent2); }
.cal-dropdown { position: absolute; top: calc(100% + 6px); right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; z-index: 200; box-shadow: 0 8px 32px rgba(0,0,0,0.5); min-width: 260px; display: none; }
.cal-dropdown.open { display: block; }
.cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.cal-title { font-size: 13px; font-weight: 600; }
.cal-nav { background: none; border: none; color: var(--text-sub); cursor: pointer; font-size: 16px; padding: 2px 7px; border-radius: 4px; }
.cal-nav:hover { background: var(--surface2); }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-day-label { text-align: center; font-size: 10px; color: var(--text-sub); padding: 3px 0; }
.cal-day { text-align: center; font-size: 11px; padding: 5px 3px; border-radius: 5px; cursor: pointer; transition: all 0.1s; }
.cal-day:hover { background: var(--surface2); }
.cal-day.empty { cursor: default; }
.cal-day.today { color: var(--accent2); font-weight: 700; }
.cal-day.in-range { background: rgba(108,99,255,0.15); }
.cal-day.range-start, .cal-day.range-end { background: var(--accent); color: #fff; font-weight: 700; }
.cal-day.has-data::after { content: "."; display: block; font-size: 14px; color: var(--accent2); line-height: 0; margin-top: 3px; }
.cal-range-display { margin-top: 10px; padding: 7px 10px; background: var(--surface2); border-radius: 7px; font-size: 11px; color: var(--text-sub); display: flex; justify-content: space-between; align-items: center; }
.cal-clear { background: none; border: none; color: var(--text-sub); cursor: pointer; font-size: 10px; padding: 2px 5px; border-radius: 3px; }
.cal-clear:hover { background: var(--surface); color: var(--text); }

/* 브랜드 바 */
.brand-bar { padding: 10px 24px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); background: var(--surface); }

/* 그리드 */
.grid-wrap { padding: 18px 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }

/* 카드 */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--card-radius); overflow: hidden; transition: transform 0.2s, border-color 0.2s; cursor: pointer; }
.card:hover { transform: translateY(-3px); border-color: var(--accent); }
.card-media { position: relative; aspect-ratio: 1/1; background: var(--surface2); overflow: hidden; }
.card-media img { width: 100%; height: 100%; object-fit: cover; }
.card-media video { width: 100%; height: 100%; object-fit: cover; }
.card-media .no-preview { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-sub); font-size: 11px; flex-direction: column; gap: 6px; }
.play-icon { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); pointer-events: none; }
.play-icon svg { width: 40px; height: 40px; color: rgba(255,255,255,0.85); }
.platform-badge { position: absolute; top: 7px; left: 7px; padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
.platform-badge.meta { background: var(--meta); color: #fff; }
.platform-badge.google { background: var(--google); color: #fff; }
.platform-badge.tiktok { background: var(--tiktok); color: #000; }
.media-badge { position: absolute; top: 7px; right: 32px; padding: 2px 5px; border-radius: 3px; font-size: 9px; background: rgba(0,0,0,0.65); color: #fff; }
.ended-badge { position: absolute; bottom: 7px; left: 7px; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; background: rgba(248,113,113,0.9); color: #fff; }
.card-ended { opacity: 0.75; }
.star-btn { position: absolute; top: 5px; right: 7px; background: rgba(0,0,0,0.5); border: none; cursor: pointer; font-size: 16px; padding: 2px 4px; border-radius: 4px; line-height: 1; transition: transform 0.15s; }
.star-btn:hover { transform: scale(1.2); }
.star-btn.starred { color: var(--star); }
.star-btn.unstarred { color: rgba(255,255,255,0.45); }
.card-body { padding: 9px 11px; }
.card-advertiser { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-headline { font-size: 11px; color: var(--text); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-keyword { font-size: 10px; color: var(--accent2); margin-top: 2px; }
.card-copy { font-size: 10px; color: var(--text-sub); margin-top: 3px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.card-date { font-size: 9px; color: var(--text-sub); }
.card-landing { font-size: 9px; color: var(--accent2); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px; }
.card-landing:hover { text-decoration: underline; }

/* 즐겨찾기 */
.fav-wrap { padding: 18px 24px; }
.fav-folder { margin-bottom: 26px; }
.fav-folder-title { font-size: 14px; font-weight: 600; color: var(--accent2); margin-bottom: 10px; display: flex; align-items: center; gap: 7px; }
.fav-folder-title::before { content: "folder"; font-family: 'Material Icons'; font-size: 16px; }
.fav-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }

/* 빈 상태 */
.empty { text-align: center; padding: 50px 20px; color: var(--text-sub); grid-column: 1/-1; }
.empty .emoji { font-size: 40px; margin-bottom: 10px; }
.empty p { font-size: 13px; }

/* 모달 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 300; display: none; align-items: center; justify-content: center; padding: 20px; }
.modal-overlay.open { display: flex; }
.modal { background: var(--surface); border-radius: 14px; border: 1px solid var(--border); max-width: 560px; width: 100%; max-height: 90vh; overflow-y: auto; }
.modal-header { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.modal-title { font-size: 15px; font-weight: 600; }
.modal-close { background: none; border: none; color: var(--text-sub); font-size: 22px; cursor: pointer; }
.modal-body { padding: 18px; }
.modal-img { width: 100%; border-radius: 8px; margin-bottom: 14px; }
.modal-meta { display: flex; flex-direction: column; gap: 7px; }
.modal-row { display: flex; gap: 8px; font-size: 12px; }
.modal-row .key { color: var(--text-sub); min-width: 76px; flex-shrink: 0; }
.modal-row .val { color: var(--text); word-break: break-all; }
.modal-link { display: inline-block; margin-top: 10px; color: var(--accent2); font-size: 12px; text-decoration: none; }
.modal-link:hover { text-decoration: underline; }
.modal-copy-box { background: var(--surface2); border-radius: 7px; padding: 10px 12px; font-size: 11px; color: var(--text-sub); line-height: 1.6; margin-top: 8px; white-space: pre-wrap; }

/* 즐겨찾기 팝업 */
.fav-popup { position: fixed; bottom: 22px; right: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; z-index: 400; min-width: 260px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); display: none; }
.fav-popup.open { display: block; }
.fav-popup h4 { font-size: 13px; margin-bottom: 10px; }
.fav-popup input { width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 7px 9px; color: var(--text); font-size: 12px; margin-bottom: 7px; outline: none; }
.fav-popup input:focus { border-color: var(--accent); }
.fav-popup-btns { display: flex; gap: 7px; margin-top: 4px; }
.btn { padding: 7px 14px; border-radius: 6px; border: none; font-size: 12px; cursor: pointer; font-weight: 500; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-secondary { background: var(--surface2); color: var(--text-sub); }
.btn:hover { opacity: 0.85; }
.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%) translateY(80px); background: var(--accent); color: #fff; padding: 9px 18px; border-radius: 18px; font-size: 12px; z-index: 500; transition: transform 0.3s; pointer-events: none; }
.toast.show { transform: translateX(-50%) translateY(0); }
.update-info { padding: 7px 24px; font-size: 10px; color: var(--text-sub); background: var(--surface2); border-bottom: 1px solid var(--border); }
@media (max-width: 640px) {
  .tabs { width: 100%; }
  .tab { flex: 1; text-align: center; font-size: 10px; padding: 6px 4px; }
  .kpi-bar { grid-template-columns: repeat(3, 1fr); }
  .grid-wrap, .fav-wrap { padding: 12px; }
  .grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
}

.brand-detail-header { margin-bottom: 20px; }
.brand-detail-title { font-size: 20px; font-weight: 700; color: var(--text); }
.brand-detail-stats { display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
.brand-stat { font-size: 11px; color: var(--text-sub); background: var(--surface2); padding: 3px 10px; border-radius: 12px; }
.brand-section { margin-bottom: 28px; }
.brand-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.brand-section-title { font-size: 14px; font-weight: 600; }
.brand-section-badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; color: #fff; }
.brand-section-badge.meta { background: var(--meta); }
.brand-section-badge.google { background: var(--google); }
.brand-section-badge.naver { background: #03c75a; }
.brand-platform-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
.brand-platform-tab { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-sub); font-size: 11px; cursor: pointer; }
.brand-platform-tab.active { border-color: var(--accent); color: var(--accent2); background: rgba(108,99,255,0.1); }
.brand-all-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }

</style>
<script src="data.js"></script>
</head>
<body>

<div class="header">
  <div class="logo">AD Ref <span>광고 레퍼런스</span></div>
  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input type="text" class="search-input" id="searchInput" placeholder="키워드 또는 브랜드명 검색...">
  </div>
  <div class="tabs">
    <button class="tab active" onclick="switchTab('search')" id="tab-search">🔍 이미지·영상</button>
    <button class="tab" onclick="switchTab('brand')" id="tab-brand">🏢 경쟁사 모음</button>
    <button class="tab" onclick="switchTab('favorites')" id="tab-favorites">⭐ 즐겨찾기</button>
    <a href="brandsearch.html" style="padding:7px 13px;border-radius:8px;border:1px solid #03c75a;background:transparent;color:#03c75a;font-size:12px;text-decoration:none;white-space:nowrap;">🔎 브랜드검색</a>
  </div>
</div>

<div class="update-info">마지막 수집: ${lastUpdated} &nbsp;|&nbsp; 총 ${totalCount}개 보관 &nbsp;|&nbsp; Meta ${metaCount} · Google ${googleCount} &nbsp;|&nbsp; 이미지 ${imageCount} · 영상 ${videoCount}</div>

<!-- KPI 카드 -->
<div class="kpi-bar" id="kpiBar">
  <div class="kpi-card"><div class="kpi-label">전체 광고</div><div class="kpi-value accent">${totalCount.toLocaleString()}</div></div>
  <div class="kpi-card"><div class="kpi-label">오늘 신규</div><div class="kpi-value green">${newToday}</div></div>
  <div class="kpi-card"><div class="kpi-label">Meta</div><div class="kpi-value meta">${metaCount.toLocaleString()}</div></div>
  <div class="kpi-card"><div class="kpi-label">Google</div><div class="kpi-value google">${googleCount.toLocaleString()}</div></div>
  <div class="kpi-card"><div class="kpi-label">영상</div><div class="kpi-value" style="color:var(--text)">${videoCount.toLocaleString()}</div></div>
  <div class="kpi-card"><div class="kpi-label">이미지</div><div class="kpi-value" style="color:var(--text)">${imageCount.toLocaleString()}</div></div>
</div>

<!-- 필터 바 -->
<div class="filter-bar" id="filterBar">
  <span class="filter-label">매체</span>
  <div class="filter-chips">
    <button class="chip active" data-platform="all" onclick="filterPlatform('all')">전체</button>
    <button class="chip" data-platform="meta" onclick="filterPlatform('meta')">Meta</button>
    <button class="chip" data-platform="google" onclick="filterPlatform('google')">Google</button>
  </div>
  <div class="divider"></div>
  <span class="filter-label">유형</span>
  <div class="filter-chips">
    <button class="chip active" data-media="all" onclick="filterMedia('all')">전체</button>
    <button class="chip" data-media="image" onclick="filterMedia('image')">이미지</button>
    <button class="chip" data-media="video" onclick="filterMedia('video')">영상</button>
  </div>
  <div class="divider"></div>
  <span class="filter-label">기간</span>
  <div class="filter-chips">
    <button class="chip active" data-period="all" onclick="filterPeriod('all')">전체</button>
    <button class="chip" data-period="7" onclick="filterPeriod('7')">7일</button>
    <button class="chip" data-period="30" onclick="filterPeriod('30')">30일</button>
    <button class="chip" data-period="180" onclick="filterPeriod('180')">6개월</button>
    <button class="chip" data-period="365" onclick="filterPeriod('365')">1년</button>
  </div>
  <div class="cal-wrap">
    <button class="cal-btn" id="calBtn" onclick="toggleCalendar()">📅 <span id="calBtnText">날짜 선택</span></button>
    <div class="cal-dropdown" id="calDropdown">
      <div class="cal-header">
        <button class="cal-nav" onclick="calMove(-1)">&#8249;</button>
        <span class="cal-title" id="calTitle"></span>
        <button class="cal-nav" onclick="calMove(1)">&#8250;</button>
      </div>
      <div class="cal-grid" id="calGrid"></div>
      <div class="cal-range-display">
        <span id="calRangeText">시작일을 클릭하세요</span>
        <button class="cal-clear" onclick="clearCalendar()">초기화</button>
      </div>
    </div>
  </div>
  <span class="count-badge" id="countBadge">0개</span>
</div>

<!-- 브랜드 바 -->
<div class="brand-bar" id="brandBar" style="display:none">
  <span class="filter-label">브랜드</span>
  <div class="filter-chips" id="brandChips"></div>
</div>

<!-- 컨텐츠 -->
<div class="grid-wrap" id="gridWrap"><div class="grid" id="grid"></div></div>
<div class="fav-wrap" id="favWrap" style="display:none"><div id="favContent"></div></div>
<div id="brandDetailWrap" style="display:none;padding:18px 24px"><div id="brandDetail"></div></div>

<!-- 모달 -->
<div class="modal-overlay" id="modalOverlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title" id="modalTitle"></span>
      <button class="modal-close" onclick="closeModal()">x</button>
    </div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>

<!-- 즐겨찾기 팝업 -->
<div class="fav-popup" id="favPopup">
  <h4>⭐ 즐겨찾기 추가</h4>
  <input type="text" id="favName" placeholder="내 이름 (예: 민수)">
  <input type="text" id="favFolder" placeholder="폴더명 (예: 증권 레퍼런스)">
  <div class="fav-popup-btns">
    <button class="btn btn-primary" onclick="confirmAddFavorite()">저장</button>
    <button class="btn btn-secondary" onclick="closeFavPopup()">취소</button>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
// 데이터는 data.js 에서 로드됨

var currentTab = 'search';
var currentPlatform = 'all';
var currentMedia = 'all';
var currentPeriod = 'all';
var currentBrand = null;
var searchText = '';
var favorites = [];
var pendingFavItem = null;
var calYear = new Date().getFullYear();
var calMonth = new Date().getMonth();
var calRangeStart = null;
var calRangeEnd = null;
var calPickStep = 0;

window.onload = function() {
  loadFavorites();
  renderBrandChips();
  renderGrid();
  document.getElementById('searchInput').addEventListener('input', function(e) {
    searchText = e.target.value.trim().toLowerCase();
    renderGrid();
  });
  document.addEventListener('click', function(e) {
    var dd = document.getElementById('calDropdown');
    var btn = document.getElementById('calBtn');
    if (dd && dd.classList.contains('open') && !dd.contains(e.target) && !btn.contains(e.target)) {
      dd.classList.remove('open');
      btn.classList.remove('active');
    }
  });
};

function switchTab(tab) {
  currentTab = tab;
  ['search','brand','favorites'].forEach(function(t) {
    document.getElementById('tab-'+t).classList.toggle('active', t === tab);
  });
  document.getElementById('filterBar').style.display = (tab === 'favorites') ? 'none' : '';
  document.getElementById('kpiBar').style.display = (tab === 'favorites') ? 'none' : '';
  document.getElementById('brandBar').style.display = (tab === 'brand') ? '' : 'none';
  document.getElementById('gridWrap').style.display = (tab === 'favorites') ? 'none' : '';
  document.getElementById('favWrap').style.display = (tab === 'favorites') ? '' : 'none';
  document.getElementById('searchInput').placeholder = tab === 'brand' ? '브랜드명 검색...' : '키워드 검색...';
  if (tab === 'favorites') renderFavorites();
  else { currentBrand = null; renderGrid(); }
}

function filterPlatform(p) {
  currentPlatform = p;
  document.querySelectorAll('[data-platform]').forEach(function(el) { el.classList.toggle('active', el.dataset.platform === p); });
  renderGrid();
}
function filterMedia(m) {
  currentMedia = m;
  document.querySelectorAll('[data-media]').forEach(function(el) { el.classList.toggle('active', el.dataset.media === m); });
  renderGrid();
}
function filterPeriod(p) {
  currentPeriod = p;
  if (p !== 'custom') { calRangeStart = null; calRangeEnd = null; calPickStep = 0; updateCalBtnText(); }
  document.querySelectorAll('[data-period]').forEach(function(el) { el.classList.toggle('active', el.dataset.period === p); });
  renderGrid();
}

function toggleCalendar() {
  var dd = document.getElementById('calDropdown');
  var btn = document.getElementById('calBtn');
  var isOpen = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
  btn.classList.toggle('active', !isOpen);
  if (!isOpen) renderCalendar();
}
function calMove(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}
function getDataDates() {
  var set = {};
  DATA.forEach(function(item) {
    if (item.collectedAt) set[item.collectedAt.slice(0,10)] = true;
  });
  return set;
}
function renderCalendar() {
  var dataDates = getDataDates();
  var months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('calTitle').textContent = calYear + '년 ' + months[calMonth];
  var firstDay = new Date(calYear, calMonth, 1).getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var today = new Date().toISOString().slice(0, 10);
  var html = ['일','월','화','수','목','금','토'].map(function(d) { return '<div class="cal-day-label">'+d+'</div>'; }).join('');
  for (var i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var mm = String(calMonth+1).padStart(2,'0');
    var dd2 = String(d).padStart(2,'0');
    var dateStr = calYear + '-' + mm + '-' + dd2;
    var cls = 'cal-day';
    if (dateStr === today) cls += ' today';
    if (dataDates[dateStr]) cls += ' has-data';
    if (calRangeStart && calRangeEnd) {
      if (dateStr > calRangeStart && dateStr < calRangeEnd) cls += ' in-range';
      if (dateStr === calRangeStart) cls += ' range-start';
      if (dateStr === calRangeEnd) cls += ' range-end';
    } else if (calRangeStart && dateStr === calRangeStart) cls += ' range-start';
    html += '<div class="'+cls+'" onclick="calSelectDate(this.dataset.date)" data-date="'+dateStr+'">'+d+'</div>';
  }
  document.getElementById('calGrid').innerHTML = html;
  var rt = document.getElementById('calRangeText');
  if (!calRangeStart) rt.textContent = '시작일을 클릭하세요';
  else if (!calRangeEnd) rt.textContent = calRangeStart + ' ~ 종료일 선택';
  else rt.textContent = calRangeStart + ' ~ ' + calRangeEnd;
}
function calSelectDate(dateStr) {
  if (calPickStep === 0) {
    calRangeStart = dateStr; calRangeEnd = null; calPickStep = 1;
  } else {
    if (dateStr < calRangeStart) { calRangeEnd = calRangeStart; calRangeStart = dateStr; }
    else calRangeEnd = dateStr;
    calPickStep = 0;
    document.getElementById('calDropdown').classList.remove('open');
    document.getElementById('calBtn').classList.remove('active');
    currentPeriod = 'custom';
    document.querySelectorAll('[data-period]').forEach(function(el) { el.classList.remove('active'); });
    renderGrid();
    updateCalBtnText();
  }
  renderCalendar();
}
function updateCalBtnText() {
  var el = document.getElementById('calBtnText');
  el.textContent = (calRangeStart && calRangeEnd) ? (calRangeStart.slice(5) + ' ~ ' + calRangeEnd.slice(5)) : '날짜 선택';
}
function clearCalendar() {
  calRangeStart = null; calRangeEnd = null; calPickStep = 0;
  currentPeriod = 'all';
  document.querySelectorAll('[data-period]').forEach(function(el) { el.classList.toggle('active', el.dataset.period === 'all'); });
  updateCalBtnText(); renderCalendar(); renderGrid();
}

function renderBrandChips() {
  var container = document.getElementById('brandChips');
  var stats = SETTINGS.brandStats || {};
  container.innerHTML = (SETTINGS.brands || []).map(function(b) {
    var s = stats[b] || {};
    return '<button class="chip" data-brand="'+esc(b)+'" onclick="selectBrand(this.dataset.brand)">'+esc(b)+(s.total?' <span style="opacity:.6">('+s.total+')</span>':'')+'</button>';
  }).join('');
}
function selectBrand(brand) {
  currentBrand = brand;
  document.querySelectorAll('[data-brand]').forEach(function(el) { el.classList.toggle('active', el.dataset.brand === brand); });
  // 브랜드 상세 뷰로 전환
  document.getElementById('gridWrap').style.display = 'none';
  document.getElementById('brandDetailWrap').style.display = '';
  renderBrandDetail(brand);
}

var brandDetailPlatform = 'all';

function renderBrandDetail(brand) {
  var items = DATA.filter(function(item) {
    return (item.advertiserName||'').toLowerCase().includes(brand.toLowerCase()) ||
           (item.keyword||'').toLowerCase().includes(brand.toLowerCase());
  });

  var metaItems = items.filter(function(i) { return i.platform === 'meta'; });
  var googleItems = items.filter(function(i) { return i.platform === 'google'; });

  // 최신순 정렬
  function sortByDate(arr) {
    return arr.slice().sort(function(a,b) { return new Date(b.collectedAt) - new Date(a.collectedAt); });
  }

  var metaSorted = sortByDate(metaItems);
  var googleSorted = sortByDate(googleItems);
  var allSorted = sortByDate(items);

  var html = '';

  // 헤더
  html += '<div class="brand-detail-header">';
  html += '<div style="display:flex;align-items:center;gap:12px">';
  html += '<button onclick="backToBrandList()" style="background:none;border:1px solid var(--border);color:var(--text-sub);padding:6px 12px;border-radius:7px;cursor:pointer;font-size:12px">← 목록</button>';
  html += '<div class="brand-detail-title">' + esc(brand) + '</div>';
  html += '</div>';
  html += '<div class="brand-detail-stats">';
  html += '<span class="brand-stat">전체 ' + items.length + '개</span>';
  html += '<span class="brand-stat" style="color:#6aadff">Meta ' + metaItems.length + '</span>';
  html += '<span class="brand-stat" style="color:#ff8a80">Google ' + googleItems.length + '</span>';
  html += '<span class="brand-stat">이미지 ' + items.filter(function(i){return i.mediaType==='image';}).length + '</span>';
  html += '<span class="brand-stat">영상 ' + items.filter(function(i){return i.mediaType==='video';}).length + '</span>';
  html += '</div></div>';

  // Top 5 섹션 (Meta / Google)
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px">';

  // Meta Top 5
  html += '<div class="brand-section">';
  html += '<div class="brand-section-header"><span class="brand-section-badge meta">META</span><span class="brand-section-title">최신 5개</span></div>';
  if (metaSorted.length === 0) {
    html += '<div style="color:var(--text-sub);font-size:12px;padding:20px 0">수집된 Meta 광고 없음</div>';
  } else {
    html += '<div class="brand-all-grid">' + metaSorted.slice(0,5).map(function(item) { return miniCard(item); }).join('') + '</div>';
  }
  html += '</div>';

  // Google Top 5
  html += '<div class="brand-section">';
  html += '<div class="brand-section-header"><span class="brand-section-badge google">GOOGLE</span><span class="brand-section-title">최신 5개</span></div>';
  if (googleSorted.length === 0) {
    html += '<div style="color:var(--text-sub);font-size:12px;padding:20px 0">수집된 Google 광고 없음</div>';
  } else {
    html += '<div class="brand-all-grid">' + googleSorted.slice(0,5).map(function(item) { return miniCard(item); }).join('') + '</div>';
  }
  html += '</div>';
  html += '</div>';

  // 전체 광고 목록 (매체 필터)
  html += '<div class="brand-section">';
  html += '<div class="brand-section-header"><span class="brand-section-title">전체 광고 목록</span><span style="font-size:11px;color:var(--text-sub)">' + items.length + '개</span></div>';
  html += '<div class="brand-platform-tabs">';
  html += '<button class="brand-platform-tab active" data-filter="all" onclick="filterBrandDetail(this.dataset.filter,this)">전체</button>';
  html += '<button class="brand-platform-tab" data-filter="meta" onclick="filterBrandDetail(this.dataset.filter,this)">Meta</button>';
  html += '<button class="brand-platform-tab" data-filter="google" onclick="filterBrandDetail(this.dataset.filter,this)">Google</button>';
  html += '<button class="brand-platform-tab" data-filter="image" onclick="filterBrandDetail(this.dataset.filter,this)">이미지만</button>';
  html += '<button class="brand-platform-tab" data-filter="video" onclick="filterBrandDetail(this.dataset.filter,this)">영상만</button>';
  html += '</div>';
  html += '<div class="brand-all-grid" id="brandAllGrid">' + allSorted.slice(0,200).map(function(item) { return cardHTML(item); }).join('') + '</div>';
  html += '</div>';

  document.getElementById('brandDetail').innerHTML = html;
  // 현재 브랜드 데이터 저장
  window.__brandDetailItems = allSorted;
}

function miniCard(item) {
  var mediaSrc = item.thumbnailUrl || item.localThumb || item.localPath || (item.mediaType !== 'video' ? item.mediaUrl : '');
  var date = item.collectedAt ? new Date(item.collectedAt).toLocaleDateString('ko-KR') : '';
  var adPeriod = (item.adStartedAt || item.adLastShownAt)
    ? ((item.adStartedAt||'?') + ' ~ ' + (item.adLastShownAt||'진행중')) : '';

  return '<div class="card" data-id="'+esc(item.id)+'" onclick="openModal(this.dataset.id)" style="font-size:10px">' +
    '<div class="card-media">' +
      (mediaSrc ? '<img src="'+esc(mediaSrc)+'" alt="" loading="lazy" onerror="this.style.opacity=0.2">' :
        '<div class="no-preview">'+(item.mediaType==='video'?'🎬':'🖼️')+'</div>') +
      (item.mediaType==='video' ? '<div class="play-icon"><svg fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>' : '') +
      '<span class="platform-badge '+item.platform+'">'+item.platform+'</span>' +
    '</div>' +
    '<div class="card-body">' +
      '<div class="card-copy" style="-webkit-line-clamp:2">'+esc(item.copyText||'')+'</div>' +
      (adPeriod ? '<div class="card-date" style="color:var(--accent2);margin-top:3px">'+esc(adPeriod)+'</div>' : '<div class="card-date">'+date+'</div>') +
      (item.landingUrl ? '<a class="card-landing" href="'+esc(item.landingUrl)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">↗ 랜딩</a>' : '') +
    '</div>' +
  '</div>';
}

function filterBrandDetail(filter, btn) {
  document.querySelectorAll('.brand-platform-tab').forEach(function(el) { el.classList.remove('active'); });
  btn.classList.add('active');
  var items = window.__brandDetailItems || [];
  var filtered = items.filter(function(item) {
    if (filter === 'all') return true;
    if (filter === 'image') return item.mediaType === 'image';
    if (filter === 'video') return item.mediaType === 'video';
    return item.platform === filter;
  });
  document.getElementById('brandAllGrid').innerHTML = filtered.slice(0,200).map(function(item) { return cardHTML(item); }).join('');
}

function backToBrandList() {
  currentBrand = null;
  document.getElementById('brandDetailWrap').style.display = 'none';
  document.getElementById('gridWrap').style.display = '';
  document.querySelectorAll('[data-brand]').forEach(function(el) { el.classList.remove('active'); });
  renderGrid();
}

function isInDateRange(item) {
  if (!item.collectedAt) return true;
  var itemDate = new Date(item.collectedAt);
  var now = new Date();
  if (currentPeriod === 'custom') {
    if (!calRangeStart || !calRangeEnd) return true;
    var start = new Date(calRangeStart);
    var end = new Date(calRangeEnd); end.setHours(23,59,59,999);
    return itemDate >= start && itemDate <= end;
  }
  if (currentPeriod === 'all') return true;
  var days = parseInt(currentPeriod);
  var cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - days);
  return itemDate >= cutoff;
}

function getFilteredItems() {
  return DATA.filter(function(item) {
    if (currentPlatform !== 'all' && item.platform !== currentPlatform) return false;
    if (currentMedia !== 'all' && item.mediaType !== currentMedia) return false;
    if (!isInDateRange(item)) return false;
    if (currentTab === 'brand') {
      if (currentBrand) {
        return (item.advertiserName||'').toLowerCase().includes(currentBrand.toLowerCase()) ||
               (item.keyword||'').toLowerCase().includes(currentBrand.toLowerCase());
      }
      return item.searchType === 'brand';
    }
    if (searchText) {
      var hay = [item.advertiserName, item.keyword, item.copyText, item.headline, item.platform].join(' ').toLowerCase();
      return hay.includes(searchText);
    }
    return true;
  });
}

function renderGrid() {
  var items = getFilteredItems();
  document.getElementById('countBadge').textContent = items.length + '개';
  var grid = document.getElementById('grid');
  if (items.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="emoji">🔍</div><p>검색 결과가 없습니다</p></div>';
    return;
  }
  grid.innerHTML = items.slice(0, 300).map(function(item) { return cardHTML(item); }).join('');
}

function cardHTML(item) {
  var isFav = favorites.some(function(f) { return f.id === item.id; });
  // 수집일 대신 게재 시작일 우선 표시
  var dateStr = item.adStartedAt || item.ad_started_at || item.collectedAt;
  var date = dateStr ? new Date(dateStr).toLocaleDateString('ko-KR') : '';
  var isEnded = item.status === 'ended';

  var mediaSrc = item.thumbnailUrl || item.localPath || (item.mediaType !== 'video' ? item.mediaUrl : '');
  var mediaHTML;
  if (item.mediaType === 'video' && item.mediaUrl) {
    mediaHTML = '<video src="'+esc(item.mediaUrl)+'" muted loop preload="none" poster="'+esc(item.thumbnailUrl||'')+'" onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0" style="width:100%;height:100%;object-fit:cover'+(isEnded?';filter:grayscale(0.4)':'')+'""></video>';
  } else if (mediaSrc) {
    mediaHTML = '<img src="'+esc(mediaSrc)+'" alt="" loading="lazy" onerror="this.style.opacity=0.2"'+(isEnded?' style="filter:grayscale(0.4)"':'')+' >';
  } else {
    mediaHTML = '<div class="no-preview"><span style="font-size:28px">'+(item.mediaType==='video'?'🎬':'🖼️')+'</span><span>미리보기 없음</span></div>';
  }

  var playIcon = (item.mediaType === 'video') ? '<div class="play-icon"><svg fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>' : '';

  var landingLink = item.landingUrl ? '<a class="card-landing" href="'+esc(item.landingUrl)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="'+esc(item.landingUrl)+'">↗ 랜딩</a>' : '';

  // 종료 배지
  var endedBadge = isEnded ? '<span class="ended-badge">종료</span>' : '';

  return '<div class="card'+(isEnded?' card-ended':'')+'" data-id="'+esc(item.id)+'" onclick="openModal(this.dataset.id)">' +
    '<div class="card-media">' +
      mediaHTML + playIcon +
      '<span class="platform-badge '+item.platform+'">'+item.platform+'</span>' +
      (item.mediaType === 'video' ? '<span class="media-badge">VIDEO</span>' : '') +
      endedBadge +
      '<button class="star-btn '+(isFav?'starred':'unstarred')+'" data-id="'+esc(item.id)+'" onclick="event.stopPropagation();toggleFav(this.dataset.id)">'+(isFav?'★':'☆')+'</button>' +
    '</div>' +
    '<div class="card-body">' +
      '<div class="card-advertiser">'+esc(item.advertiserName||'알 수 없음')+'</div>' +
      (item.headline ? '<div class="card-headline">'+esc(item.headline)+'</div>' : '') +
      '<div class="card-keyword">#'+esc(item.keyword||'')+'</div>' +
      '<div class="card-copy">'+esc(item.copyText||'')+'</div>' +
      '<div class="card-meta"><span class="card-date">'+date+(isEnded?' ~ '+new Date(item.endedAt||'').toLocaleDateString('ko-KR'):'')+'</span>'+landingLink+'</div>' +
    '</div>' +
  '</div>';
}

function openModal(id) {
  var item = DATA.find(function(i) { return i.id === id; });
  if (!item) return;
  document.getElementById('modalTitle').textContent = item.advertiserName || '광고 상세';

  var mediaSrc = item.thumbnailUrl || item.localPath || (item.mediaType !== 'video' ? item.mediaUrl : '');
  var mediaHTML = '';
  if (item.mediaType === 'video' && item.mediaUrl) {
    mediaHTML = '<video src="'+esc(item.mediaUrl)+'" controls poster="'+esc(item.thumbnailUrl||'')+'" style="width:100%;border-radius:8px;margin-bottom:14px"></video>';
  } else if (item.mediaType === 'video' && item.thumbnailUrl) {
    mediaHTML = '<img class="modal-img" src="'+esc(item.thumbnailUrl)+'" alt=""><p style="font-size:11px;color:var(--text-sub);margin-top:-10px;margin-bottom:14px">영상 미리보기 (썸네일)</p>';
  } else if (mediaSrc) {
    mediaHTML = '<img class="modal-img" src="'+esc(mediaSrc)+'" alt="">';
  }

  var dateStr = item.adStartedAt || item.ad_started_at || item.collectedAt;
  var date = dateStr ? new Date(dateStr).toLocaleString('ko-KR') : '-';
  var adPeriod = null;
  if (item.adStartedAt || item.ad_started_at) {
    var start = item.adStartedAt || item.ad_started_at;
    var end = item.adLastShownAt || item.ad_last_shown_at || item.endedAt;
    adPeriod = new Date(start).toLocaleDateString('ko-KR') + ' ~ ' + (end ? new Date(end).toLocaleDateString('ko-KR') : '진행 중');
  }

  document.getElementById('modalBody').innerHTML =
    mediaHTML +
    '<div class="modal-meta">' +
      '<div class="modal-row"><span class="key">매체</span><span class="val">'+esc(item.platform)+'</span></div>' +
      '<div class="modal-row"><span class="key">광고주</span><span class="val">'+esc(item.advertiserName||'-')+'</span></div>' +
      '<div class="modal-row"><span class="key">키워드</span><span class="val">'+esc(item.keyword||'-')+'</span></div>' +
      '<div class="modal-row"><span class="key">상태</span><span class="val" style="color:'+(item.status==='ended'?'#f87171':'#34d399')+'">'+(item.status==='ended'?'종료':'집행 중')+'</span></div>' +
      '<div class="modal-row"><span class="key">게재 시작일</span><span class="val">'+date+'</span></div>' +
      (adPeriod ? '<div class="modal-row"><span class="key">게재기간</span><span class="val">'+esc(adPeriod)+'</span></div>' : '') +
      (item.headline ? '<div class="modal-row"><span class="key">헤드라인</span><span class="val">'+esc(item.headline)+'</span></div>' : '') +
      (item.landingUrl ? '<div class="modal-row"><span class="key">랜딩 URL</span><span class="val"><a href="'+esc(item.landingUrl)+'" target="_blank" style="color:var(--accent2)">'+esc(item.landingUrl.slice(0,60))+'...</a></span></div>' : '') +
    '</div>' +
    (item.copyText ? '<div class="modal-copy-box">'+esc(item.copyText)+'</div>' : '') +
    (item.sourceUrl ? '<a class="modal-link" href="'+esc(item.sourceUrl)+'" target="_blank" rel="noopener">원본 광고 보기 →</a>' : '');

  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function loadFavorites() {
  if (SETTINGS.appsScriptUrl && SETTINGS.appsScriptUrl.indexOf('여기에') < 0) {
    var script = document.createElement('script');
    script.src = SETTINGS.appsScriptUrl + '?action=list&callback=__onFavLoad';
    document.head.appendChild(script);
  }
  try { var local = localStorage.getItem('ad_ref_favorites'); if (local) favorites = JSON.parse(local); } catch(e) {}
}
window.__onFavLoad = function(data) {
  if (Array.isArray(data)) { favorites = data; localStorage.setItem('ad_ref_favorites', JSON.stringify(favorites)); }
};
function toggleFav(id) {
  if (favorites.some(function(f) { return f.id === id; })) {
    favorites = favorites.filter(function(f) { return f.id !== id; });
    saveFavorites(); refreshStars(); showToast('즐겨찾기에서 제거했습니다');
  } else {
    pendingFavItem = id;
    document.getElementById('favName').value = localStorage.getItem('ad_ref_username') || '';
    document.getElementById('favFolder').value = localStorage.getItem('ad_ref_lastfolder') || '';
    document.getElementById('favPopup').classList.add('open');
  }
}
function confirmAddFavorite() {
  var name = document.getElementById('favName').value.trim() || '나';
  var folder = document.getElementById('favFolder').value.trim() || '기본 즐겨찾기';
  localStorage.setItem('ad_ref_username', name);
  localStorage.setItem('ad_ref_lastfolder', folder);
  var entry = { id: pendingFavItem, name: name, folder: folder, addedAt: new Date().toISOString() };
  favorites.push(entry);
  saveFavorites(entry); refreshStars(); closeFavPopup();
  showToast('⭐ 즐겨찾기에 추가했습니다');
}
function closeFavPopup() { document.getElementById('favPopup').classList.remove('open'); pendingFavItem = null; }
function saveFavorites(newEntry) {
  localStorage.setItem('ad_ref_favorites', JSON.stringify(favorites));
  if (SETTINGS.appsScriptUrl && SETTINGS.appsScriptUrl.indexOf('여기에') < 0 && newEntry) {
    var script = document.createElement('script');
    var p = new URLSearchParams(Object.assign({action:'add'}, newEntry));
    script.src = SETTINGS.appsScriptUrl + '?' + p.toString() + '&callback=__noop';
    document.head.appendChild(script);
  }
}
window.__noop = function() {};
function refreshStars() {
  document.querySelectorAll('.star-btn').forEach(function(btn) {
    var id = btn.dataset.id;
    if (!id) return;
    var isFav = favorites.some(function(f) { return f.id === id; });
    btn.textContent = isFav ? '★' : '☆';
    btn.className = 'star-btn ' + (isFav ? 'starred' : 'unstarred');
  });
}
function renderFavorites() {
  var container = document.getElementById('favContent');
  if (favorites.length === 0) {
    container.innerHTML = '<div class="empty"><div class="emoji">⭐</div><p>즐겨찾기한 광고가 없습니다</p></div>';
    return;
  }
  var folders = {};
  favorites.forEach(function(f) { if (!folders[f.folder]) folders[f.folder] = []; folders[f.folder].push(f); });
  container.innerHTML = Object.keys(folders).map(function(folder) {
    var cards = folders[folder].map(function(f) {
      var item = DATA.find(function(d) { return d.id === f.id; });
      return item ? cardHTML(item) : '';
    }).join('');
    return '<div class="fav-folder"><div class="fav-folder-title">'+esc(folder)+' <span style="font-size:11px;color:var(--text-sub);font-weight:400">'+folders[folder].length+'개</span></div><div class="fav-grid">'+cards+'</div></div>';
  }).join('');
}

function showToast(msg) {
  var t = document.getElementById('toast'); t.textContent = msg;
  t.classList.add('show'); setTimeout(function() { t.classList.remove('show'); }, 2500);
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
</script>
</body>
</html>`;

  var outputPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log('HTML 저장: ' + outputPath);
  return outputPath;
}

module.exports = { generateSite };
