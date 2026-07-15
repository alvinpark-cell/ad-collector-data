/**
 * 브랜드검색 전용 뷰어 페이지 생성기
 * output/brandsearch.html
 */

const fs = require('fs');
const path = require('path');

function generateBrandsearchSite(bsIndex, settings) {
  const outputDir = settings.outputDir;
  const lastUpdated = new Date().toLocaleString('ko-KR');
  const brands = settings.brands || [];

  const DATA_JSON = JSON.stringify(bsIndex);
  const BRANDS_JSON = JSON.stringify(brands);

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>브랜드검색 모니터링</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f0f13; --surface: #1a1a24; --surface2: #22222f; --border: #2e2e3e;
  --accent: #6c63ff; --accent2: #a78bfa; --text: #e2e2f0; --text-sub: #8888aa;
  --naver: #03c75a; --card-radius: 12px;
}
body { background: var(--bg); color: var(--text); font-family: -apple-system, 'Segoe UI', sans-serif; min-height: 100vh; }

.header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 100; }
.logo { font-size: 17px; font-weight: 700; color: var(--naver); }
.logo span { color: var(--text-sub); font-size: 11px; font-weight: 400; margin-left: 8px; }
.back-btn { padding: 6px 12px; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--text-sub); font-size: 12px; cursor: pointer; text-decoration: none; }
.back-btn:hover { border-color: var(--accent); color: var(--accent2); }
.update-info { padding: 7px 24px; font-size: 10px; color: var(--text-sub); background: var(--surface2); border-bottom: 1px solid var(--border); }

/* 브랜드 탭 */
.brand-tabs { padding: 14px 24px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); background: var(--surface); }
.brand-tab { padding: 7px 16px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text-sub); font-size: 13px; cursor: pointer; transition: all 0.2s; }
.brand-tab.active { background: var(--naver); border-color: var(--naver); color: #fff; font-weight: 600; }
.brand-tab:hover:not(.active) { border-color: var(--naver); color: var(--naver); }

/* 메인 */
.main { padding: 20px 24px; }

/* PC/MO 섹션 */
.device-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
@media (max-width: 900px) { .device-sections { grid-template-columns: 1fr; } }

.device-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--card-radius); overflow: hidden; }
.device-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.device-badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; background: var(--naver); color: #fff; }
.device-title { font-size: 14px; font-weight: 600; }
.device-date { font-size: 10px; color: var(--text-sub); margin-left: auto; }
.device-body { padding: 14px; }
.bs-screenshot { width: 100%; border-radius: 8px; display: block; }
.no-data { padding: 40px; text-align: center; color: var(--text-sub); font-size: 13px; }

/* 버튼 랜딩 섹션 */
.landing-section { margin-top: 24px; }
.landing-title { font-size: 13px; font-weight: 600; color: var(--accent2); margin-bottom: 12px; }
.landing-list { display: flex; flex-direction: column; gap: 16px; }
.landing-item { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.landing-item-header { padding: 10px 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--border); }
.btn-label { background: var(--accent); color: #fff; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.btn-url { font-size: 10px; color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.btn-url a { color: var(--accent2); text-decoration: none; }
.btn-url a:hover { text-decoration: underline; }
.landing-preview { position: relative; overflow: hidden; }
.landing-preview img { width: 100%; display: block; max-height: 400px; object-fit: cover; object-position: top; }
.landing-preview .fade { position: absolute; bottom: 0; left: 0; right: 0; height: 80px; background: linear-gradient(transparent, var(--surface2)); }
.landing-preview .open-btn { position: absolute; bottom: 10px; right: 10px; padding: 5px 12px; background: var(--accent); color: #fff; border-radius: 6px; font-size: 11px; text-decoration: none; }
.no-screenshot { padding: 20px; text-align: center; color: var(--text-sub); font-size: 11px; }

/* 히스토리 */
.history-section { margin-top: 32px; }
.history-title { font-size: 14px; font-weight: 600; margin-bottom: 14px; color: var(--text); display: flex; align-items: center; gap: 8px; }
.history-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
.history-tab { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-sub); font-size: 11px; cursor: pointer; }
.history-tab.active { border-color: var(--naver); color: var(--naver); background: rgba(3,199,90,0.08); }
.history-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.history-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; cursor: pointer; transition: border-color 0.2s; }
.history-card:hover { border-color: var(--naver); }
.history-card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; object-position: top; }
.history-card-body { padding: 8px 10px; }
.history-card-device { font-size: 9px; color: var(--naver); font-weight: 700; }
.history-card-date { font-size: 10px; color: var(--text-sub); margin-top: 2px; }

/* 모달 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 300; display: none; align-items: center; justify-content: center; padding: 16px; }
.modal-overlay.open { display: flex; }
.modal { background: var(--surface); border-radius: 14px; border: 1px solid var(--border); max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; }
.modal-header { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: var(--surface); z-index: 1; }
.modal-title { font-size: 14px; font-weight: 600; }
.modal-close { background: none; border: none; color: var(--text-sub); font-size: 22px; cursor: pointer; }
.modal-body { padding: 18px; }
.modal-body img { width: 100%; border-radius: 8px; }
.modal-meta { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.modal-row { display: flex; gap: 8px; font-size: 12px; }
.modal-row .key { color: var(--text-sub); min-width: 70px; }
.modal-row .val { color: var(--text); word-break: break-all; }
.modal-row a { color: var(--accent2); text-decoration: none; }
.modal-row a:hover { text-decoration: underline; }
</style>
</head>
<body>

<div class="header">
  <div class="logo">네이버 브랜드검색 <span>모니터링</span></div>
  <a href="index.html" class="back-btn">← 메인으로</a>
</div>
<div class="update-info">마지막 수집: ${lastUpdated}</div>

<!-- 브랜드 탭 -->
<div class="brand-tabs" id="brandTabs"></div>

<!-- 메인 컨텐츠 -->
<div class="main" id="mainContent">
  <div class="no-data">브랜드를 선택해주세요</div>
</div>

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

<script>
var DATA = ${DATA_JSON};
var BRANDS = ${BRANDS_JSON};
var currentBrand = null;
var currentHistoryDevice = 'all';

window.onload = function() {
  renderBrandTabs();
  if (BRANDS.length > 0) selectBrand(BRANDS[0]);
};

function renderBrandTabs() {
  var container = document.getElementById('brandTabs');
  container.innerHTML = BRANDS.map(function(b) {
    var hasData = DATA.some(function(d) { return d.advertiserName === b; });
    return '<button class="brand-tab" onclick="selectBrand(\'' + esc(b) + '\')" data-brand="' + esc(b) + '">' +
      esc(b) + (hasData ? '' : ' <span style="opacity:.4;font-size:10px">(미수집)</span>') +
      '</button>';
  }).join('');
}

function selectBrand(brand) {
  currentBrand = brand;
  document.querySelectorAll('.brand-tab').forEach(function(el) {
    el.classList.toggle('active', el.dataset.brand === brand);
  });
  renderBrandContent(brand);
}

function renderBrandContent(brand) {
  var brandData = DATA.filter(function(d) { return d.advertiserName === brand; });
  var latest = getLatestByDevice(brandData);

  var html = '';

  // PC / MO 최신 소재
  html += '<div class="device-sections">';
  html += renderDeviceSection(latest.pc, 'PC', brand);
  html += renderDeviceSection(latest.mo, 'MO', brand);
  html += '</div>';

  // 히스토리
  if (brandData.length > 0) {
    html += renderHistory(brandData, brand);
  }

  document.getElementById('mainContent').innerHTML = html;
}

function getLatestByDevice(data) {
  var pc = data.filter(function(d) { return d.device === 'pc'; }).sort(function(a,b) { return new Date(b.collectedAt) - new Date(a.collectedAt); })[0] || null;
  var mo = data.filter(function(d) { return d.device === 'mo'; }).sort(function(a,b) { return new Date(b.collectedAt) - new Date(a.collectedAt); })[0] || null;
  return { pc, mo };
}

function renderDeviceSection(item, label, brand) {
  var date = item ? new Date(item.collectedAt).toLocaleDateString('ko-KR') : '';
  var html = '<div class="device-section">';
  html += '<div class="device-header">';
  html += '<span class="device-badge">' + label + '</span>';
  html += '<span class="device-title">네이버 브랜드검색 · ' + esc(brand) + '</span>';
  if (date) html += '<span class="device-date">' + date + '</span>';
  html += '</div>';
  html += '<div class="device-body">';

  if (!item || !item.localPath) {
    html += '<div class="no-data">수집된 데이터가 없습니다</div>';
  } else {
    html += '<img class="bs-screenshot" src="' + esc(item.localPath) + '" alt="' + label + ' 브랜드검색" onclick="openScreenshotModal(\'' + esc(item.id) + '\')">';

    // 버튼 랜딩 목록
    if (item.buttons && item.buttons.length > 0) {
      html += '<div class="landing-section">';
      html += '<div class="landing-title">버튼별 랜딩 페이지</div>';
      html += '<div class="landing-list">';
      item.buttons.forEach(function(btn) {
        html += '<div class="landing-item">';
        html += '<div class="landing-item-header">';
        html += '<span class="btn-label">' + esc(btn.buttonText || '버튼') + '</span>';
        html += '<span class="btn-url"><a href="' + esc(btn.finalUrl || btn.buttonUrl) + '" target="_blank" rel="noopener">' + esc((btn.finalUrl || btn.buttonUrl).slice(0, 60)) + '...</a></span>';
        html += '</div>';
        if (btn.landingScreenshot) {
          html += '<div class="landing-preview">';
          html += '<img src="' + esc(btn.landingScreenshot) + '" alt="랜딩 페이지">';
          html += '<div class="fade"></div>';
          html += '<a href="' + esc(btn.finalUrl || btn.buttonUrl) + '" target="_blank" rel="noopener" class="open-btn">랜딩 열기 →</a>';
          html += '</div>';
        } else {
          html += '<div class="no-screenshot">랜딩 캡처 없음</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
    }
  }

  html += '</div></div>';
  return html;
}

function renderHistory(data, brand) {
  var html = '<div class="history-section">';
  html += '<div class="history-title">수집 히스토리 <span style="font-size:11px;color:var(--text-sub);font-weight:400">' + data.length + '개</span></div>';
  html += '<div class="history-tabs">';
  html += '<button class="history-tab active" onclick="filterHistory(\'all\', this)">전체</button>';
  html += '<button class="history-tab" onclick="filterHistory(\'pc\', this)">PC</button>';
  html += '<button class="history-tab" onclick="filterHistory(\'mo\', this)">MO</button>';
  html += '</div>';
  html += '<div class="history-grid" id="historyGrid">';
  html += renderHistoryCards(data, 'all');
  html += '</div></div>';
  return html;
}

function renderHistoryCards(data, device) {
  var filtered = device === 'all' ? data : data.filter(function(d) { return d.device === device; });
  filtered = filtered.sort(function(a,b) { return new Date(b.collectedAt) - new Date(a.collectedAt); });
  if (filtered.length === 0) return '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-sub);font-size:12px">수집된 히스토리가 없습니다</div>';
  return filtered.map(function(item) {
    var date = new Date(item.collectedAt).toLocaleDateString('ko-KR');
    return '<div class="history-card" onclick="openScreenshotModal(\'' + esc(item.id) + '\')">' +
      (item.localPath ? '<img src="' + esc(item.localPath) + '" alt="">' : '<div style="aspect-ratio:4/3;background:var(--surface2);display:flex;align-items:center;justify-content:center;color:var(--text-sub);font-size:11px">이미지 없음</div>') +
      '<div class="history-card-body">' +
        '<div class="history-card-device">' + (item.device||'').toUpperCase() + '</div>' +
        '<div class="history-card-date">' + date + '</div>' +
      '</div></div>';
  }).join('');
}

function filterHistory(device, btn) {
  document.querySelectorAll('.history-tab').forEach(function(el) { el.classList.remove('active'); });
  btn.classList.add('active');
  var brand = currentBrand;
  var data = DATA.filter(function(d) { return d.advertiserName === brand; });
  document.getElementById('historyGrid').innerHTML = renderHistoryCards(data, device);
}

function openScreenshotModal(id) {
  var item = DATA.find(function(d) { return d.id === id; });
  if (!item) return;
  var date = new Date(item.collectedAt).toLocaleString('ko-KR');
  document.getElementById('modalTitle').textContent = item.advertiserName + ' · ' + (item.device||'').toUpperCase() + ' 브랜드검색';
  var html = item.localPath ? '<img src="' + esc(item.localPath) + '" alt="">' : '<div style="text-align:center;padding:40px;color:var(--text-sub)">이미지 없음</div>';
  html += '<div class="modal-meta">';
  html += '<div class="modal-row"><span class="key">수집일</span><span class="val">' + date + '</span></div>';
  html += '<div class="modal-row"><span class="key">디바이스</span><span class="val">' + (item.device||'').toUpperCase() + '</span></div>';
  if (item.buttons && item.buttons.length > 0) {
    html += '<div class="modal-row"><span class="key">버튼 수</span><span class="val">' + item.buttons.length + '개</span></div>';
    item.buttons.forEach(function(btn) {
      html += '<div class="modal-row"><span class="key">' + esc(btn.buttonText||'버튼') + '</span><span class="val"><a href="' + esc(btn.finalUrl||btn.buttonUrl) + '" target="_blank">' + esc((btn.finalUrl||btn.buttonUrl).slice(0,60)) + '...</a></span></div>';
    });
  }
  html += '</div>';
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
</script>
</body>
</html>`;

  const outputPath = path.join(outputDir, 'brandsearch.html');
  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log('브랜드검색 페이지 저장: ' + outputPath);
  return outputPath;
}

module.exports = { generateBrandsearchSite };
