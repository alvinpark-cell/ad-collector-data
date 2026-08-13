/**
 * 경쟁사 동향 보고 - 타임보드/스페셜DA/유튜브/ATL 4개 탭에 데이터를 쓰고 읽는 백엔드
 *
 * 배포 방법:
 * 1. 대상 스프레드시트(11Ju3THj2RysQ_tq9s_AyTvur7m42bzDp-_a1By7rmq0) 열기
 * 2. 확장 프로그램 > Apps Script
 * 3. 이 파일 내용을 Code.gs 에 붙여넣기 (Ctrl+S로 저장 꼭 하기)
 * 4. 배포 > 배포 관리 > 연필 아이콘 > 버전: 새 버전 > 배포
 * 5. 배포 URL을 ad-collector/settings.json 의 competitorSheetWebAppUrl 에 붙여넣기
 *
 * 탭이 없으면 아래 헤더로 자동 생성됨(이미 있는 탭은 그 탭의 실제 헤더 순서를 그대로
 * 따름 - 코드에 하드코딩된 순서가 아니라 시트 1행을 읽어서 이름으로 매칭하기 때문에,
 * 사람이 헤더 순서를 다르게 만들어놔도 값이 엉뚱한 칸에 들어가지 않음, 2026-08-13 확인된
 * 버그 수정).
 * - 타임보드: 날짜 | 시간 | 브랜드 | 이미지URL | URL
 * - 스페셜DA: 날짜 | 시간 | 브랜드 | 이미지URL | URL
 * - 유튜브:   브랜드 | 영상제목 | 게시월 | 조회수 | 1개월평균조회수 | URL
 * - ATL:      날짜 | 브랜드 | 제목 | URL   (팀이 직접 수동 입력하는 탭)
 */

const SHEET_ID = '11Ju3THj2RysQ_tq9s_AyTvur7m42bzDp-_a1By7rmq0';

// 새 탭을 만들 때만 쓰는 기본 헤더 - 이미 있는 탭은 그 탭의 실제 1행을 그대로 씀.
const DEFAULT_HEADERS = {
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
    sheet.appendRow(DEFAULT_HEADERS[tabName] || ['data']);
  }
  return sheet;
}

function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
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
      if (!DEFAULT_HEADERS[tab]) throw new Error('알 수 없는 탭: ' + tab);
      result = rowsToObjects(getTab(tab));
    } else if (action === 'list_all') {
      result = {};
      Object.keys(DEFAULT_HEADERS).forEach(tab => { result[tab] = rowsToObjects(getTab(tab)); });
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

// 헤더 이름을 공백 무시하고 비교해서 body.row 값을 찾는다 - "브랜드"/"브랜드 명",
// "이미지URL"/"이미지 URL"처럼 시트 실제 헤더와 우리 코드가 보내는 키 이름이 살짝
// 다를 수 있어서(2026-08-13 확인).
function findValueForHeader(row, header) {
  const target = header.replace(/\s+/g, '');
  const key = Object.keys(row).find(k => k.replace(/\s+/g, '') === target);
  return key !== undefined ? row[key] : '';
}

function doPost(e) {
  let result;
  try {
    const body = JSON.parse(e.postData.contents);
    const tab = body.tab;
    if (!DEFAULT_HEADERS[tab]) throw new Error('알 수 없는 탭: ' + tab);
    const sheet = getTab(tab);
    // 코드에 하드코딩된 순서가 아니라, 시트 1행에 실제로 적혀있는 헤더 순서를 읽어서
    // 그 순서 그대로 값을 채운다 - 사람이 헤더 순서를 다르게 만들어놔도 안전함.
    const headers = getHeaders(sheet);
    const values = headers.map(h => findValueForHeader(body.row, h));

    const rowIndex = sheet.getLastRow() + 1;
    // 날짜/시간처럼 보이는 문자열을 시트가 자동으로 날짜형으로 바꿔버리는 걸 막기 위해,
    // 모든 칸을 일단 "일반 텍스트"(@)로 지정한 뒤 값을 넣는다(2026-08-13: 좁은 정규식으로
    // 날짜만 골라 텍스트 처리했다가 시간 문자열("오후 5:00")은 못 잡아서 또 깨진 적 있음 -
    // 그 뒤로는 전부 텍스트로 통일).
    const range = sheet.getRange(rowIndex, 1, 1, values.length);
    range.setNumberFormat('@');
    range.setValues([values]);

    result = { success: true };
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
