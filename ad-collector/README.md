# 📊 AD Ref - 광고 레퍼런스 자동 수집기

Meta(Facebook/Instagram), Google 광고 투명성 센터, TikTok Creative Center에서  
경쟁사 광고를 자동 수집해서 팀이 함께 볼 수 있는 HTML 뷰어를 만들어주는 도구입니다.

---

## 🚀 처음 설치하기 (딱 한 번만)

### 1. Node.js 설치
https://nodejs.org 에서 **LTS 버전** 다운로드 후 설치

### 2. 이 폴더를 아무데나 저장
예: `C:\Users\내이름\Documents\ad-collector\`

### 3. 터미널(명령 프롬프트) 열기
- Windows: `Win + R` → `cmd` 입력
- Mac: Spotlight에서 `터미널` 검색

### 4. 이 폴더로 이동
```
cd C:\Users\내이름\Documents\ad-collector
```

### 5. 필요한 패키지 설치
```
npm install
```

### 6. 브라우저 설치
```
npm run install-browser
```

---

## ⚙️ 설정하기 (`settings.json` 파일 수정)

메모장으로 `settings.json` 파일을 열어서 수정하세요:

```json
{
  "appsScriptUrl": "여기에_구글_앱스스크립트_URL_붙여넣기",
  "scheduleHour": 13,
  "keywords": ["증권", "주식", "MTS", "HTS"],
  "brands": ["키움증권", "미래에셋", "삼성증권"]
}
```

- **keywords**: 검색할 키워드 목록 (원하는 대로 추가/수정)
- **brands**: 경쟁사 브랜드명 목록
- **appsScriptUrl**: 즐겨찾기 공유 기능용 (선택사항, 아래 참고)

---

## 📋 즐겨찾기 공유 설정 (Google Apps Script - 선택사항)

팀원들끼리 즐겨찾기를 공유하고 싶다면:

1. https://script.google.com 접속 (구글 계정으로 로그인)
2. 새 프로젝트 만들기
3. `Code.gs` 파일 내용을 복사해서 붙여넣기
4. 구글 드라이브에서 새 스프레드시트 만들기
   - URL에서 긴 ID 복사 (예: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OhNE` 부분)
   - `Code.gs` 안의 `SHEET_ID`에 붙여넣기
5. 배포 → 웹 앱으로 배포 → 액세스: 모든 사용자
6. 배포 URL을 `settings.json`의 `appsScriptUrl`에 붙여넣기

---

## ▶️ 실행하기

### 지금 바로 한 번 수집
```
npm run collect
```

### 평일 오후 1시 자동 수집 (스케줄러)
```
npm run schedule
```
> ⚠️ 스케줄러가 실행되는 동안 이 터미널 창을 닫으면 안 됩니다.  
> 컴퓨터가 오후 1시에 켜져 있어야 수집됩니다.

---

## 📁 결과물 확인

수집 완료 후 `output/` 폴더가 생성됩니다:
```
output/
  index.html        ← 이 파일을 브라우저로 열면 됩니다!
  images/
    meta/
    google/
    tiktok/
```

**`output/index.html`을 더블클릭**하면 광고 레퍼런스 뷰어가 열립니다.

---

## 📤 구글 드라이브에 공유하기

1. 수집 완료 후 `output` 폴더 전체를 구글 드라이브에 업로드
2. 팀원들에게 드라이브 폴더 공유
3. 팀원들은 드라이브에서 `index.html`을 다운받아 브라우저로 열면 됩니다

> 💡 매번 업로드하기 번거롭다면, 구글 드라이브 데스크톱 앱을 설치하고  
> `output` 폴더를 드라이브 동기화 폴더로 지정하면 자동 동기화됩니다.

---

## 📋 (선택) 영상 썸네일을 위한 ffmpeg 설치

Meta 영상의 미리보기 이미지를 자동 생성하려면 ffmpeg가 필요해요.
설치 안 해도 수집/저장에는 문제없고, 영상 카드에 재생 아이콘만 표시돼요.

1. https://www.gyan.dev/ffmpeg/builds/ 접속
2. "release essentials" 버전 다운로드
3. 압축 풀고 `bin` 폴더를 환경변수 PATH에 추가
4. 터미널에서 `ffmpeg -version` 입력해서 확인

---

## ❓ 자주 묻는 질문

**Q: 처음 수집이 너무 오래 걸려요**  
A: 정상입니다. 키워드×3개 매체를 전부 긁어오기 때문에 처음엔 시간이 걸립니다.  
두 번째부터는 중복 제거로 훨씬 빠릅니다.

**Q: 이미지가 뜨지 않아요**  
A: Meta/Google/TikTok이 외부 이미지 링크를 차단하는 경우가 있습니다.  
카드를 클릭해서 "원본 광고 보기" 링크로 확인하세요.

**Q: 스케줄러가 오후 1시에 실행이 안 돼요**  
A: 컴퓨터가 켜져 있고 터미널 창이 열려 있어야 합니다.

---

## 📞 추가 기능 요청

키워드 추가, UI 변경, 새 매체 추가 등은 언제든지 말씀해주세요!
