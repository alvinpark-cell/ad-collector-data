/**
 * 경쟁사 동향 보고 - 타임보드/스페셜DA/유튜브/ATL 4개 탭에 데이터를 쓰고 읽는 백엔드
 *
 * 배포 방법:
 * 1. 대상 스프레드시트(11Ju3THj2RysQ_tq9s_AyTvur7m42bzDp-_a1By7rmq0) 열기
 * 2. 확장 프로그램 > Apps Script
 * 3. 이 파일 내용을 Code.gs 에 붙여넣기
 * 4. 배포 > 새 배포 > 웹 앱 > 액세스 권한: "모든 사용자" > 배포
 * 5. 배포 URL을 ad-collector/settings.json 의 competitorSheetWebAppUrl 에 붙여넣기
 *
 * 탭 구조 (없으면 자동 생성됨, 헤더 순서 그대로):
 * - 타임보드: 날짜 | 시간 | 브랜드 | 이미지URL | URL
 * - 스페셜DA: 날짜 | 시간 | 브랜드 | 이미지URL | URL
 * - 유튜브:   브랜드 | 영상제목 | 게시월 | 조회수 | 1개월평균조회수 | URL
 * - ATL:      날짜 | 브랜드 | 제목 | URL   (팀이 직접 수동 입력하는 탭)
 */

const SHEET_ID = '11Ju3THj2RysQ_tq9s_AyTvur7m42bzDp-_a1By7rmq0';

const TAB_HEADERS = {
  '타임보드': ['날짜', '시간', '브랜드', '이미지URL', 'URL'],
  '스페셜DA': ['날짜', '시간', '브랜드', '이미지URL', 'URL'],
  '유튜브': ['브랜드', '영상제목', '게시월', '조회수', '1개월평균조회수', 'URL'],
  'ATL': ['날짜', '브랜드', '제목', 'URL'],
};

function getTab(tabName) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(TAB_HEADERS[tabName] || ['data']);
  }
  return sheet;
}

function rowsToObjects(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback; // 브라우저 JSONP 호출일 때만 넘어옴 - 서버(node) 호출은 순수 JSON으로 응답
  let result;
  try {
    if (action === 'list') {
      const tab = e.parameter.tab;
      if (!TAB_HEADERS[tab]) throw new Error('알 수 없는 탭: ' + tab);
      result = rowsToObjects(getTab(tab));
    } else if (action === 'list_all') {
      result = {};
      Object.keys(TAB_HEADERS).forEach(tab => { result[tab] = rowsToObjects(getTab(tab)); });
    } else {
      result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message };
  }
  const json = JSON.stringify(result);
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let result;
  try {
    const body = JSON.parse(e.postData.contents);
    const tab = body.tab;
    if (!TAB_HEADERS[tab]) throw new Error('알 수 없는 탭: ' + tab);
    const headers = TAB_HEADERS[tab];
    const sheet = getTab(tab);
    const row = headers.map(h => body.row[h] !== undefined ? body.row[h] : '');
    sheet.appendRow(row);
    result = { success: true };
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
