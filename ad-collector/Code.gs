/**
 * Google Apps Script - 즐겨찾기 공유 백엔드
 * 
 * 사용법:
 * 1. script.google.com 에서 새 프로젝트 생성
 * 2. 이 파일 내용을 Code.gs 에 붙여넣기
 * 3. 배포 > 웹 앱으로 배포 > "모든 사용자" 접근 허용
 * 4. 배포 URL을 settings.json 의 appsScriptUrl 에 붙여넣기
 * 5. Google 스프레드시트 ID를 아래 SHEET_ID 에 입력
 *    (drive.google.com 에서 시트 만들고 URL 중간 긴 문자열이 ID)
 */

const SHEET_ID = '여기에_구글_스프레드시트_ID_입력';
const SHEET_NAME = 'favorites';

function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback || '__noop';

  let result;
  try {
    if (action === 'list') {
      result = getFavorites();
    } else if (action === 'add') {
      result = addFavorite(e.parameter);
    } else if (action === 'remove') {
      result = removeFavorite(e.parameter.id);
    } else {
      result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message };
  }

  // JSONP 방식으로 응답 (크로스도메인 허용)
  const json = JSON.stringify(result);
  return ContentService
    .createTextOutput(`${callback}(${json})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['id', 'name', 'folder', 'addedAt']); // 헤더
  }
  return sheet;
}

function getFavorites() {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function addFavorite(params) {
  const sheet = getSheet();
  sheet.appendRow([
    params.id || '',
    params.name || '',
    params.folder || '기본 즐겨찾기',
    params.addedAt || new Date().toISOString(),
  ]);
  return { success: true };
}

function removeFavorite(id) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i + 1);
    }
  }
  return { success: true };
}
