# 광고 레퍼런스 수집 시스템

메리츠증권 + 경쟁 증권사(미래에셋, 삼성, NH투자, KB, 신한투자, 한국투자, 키움, 토스,
대신, 한화투자) 광고/미디어 동향을 자동 수집하고 대시보드로 보여주는 내부 도구입니다.

이 저장소는 두 개의 프로젝트로 구성됩니다.

- **`ad-collector/`** — Playwright/Apify 기반 수집기 (Node.js, 백그라운드 상시 실행)
- **`ad-ref/`** — 수집 결과를 보여주는 대시보드 (Next.js, 정적 export)

---

## 1. 프로젝트 개요

```
[ad-collector] 광고/미디어 수집 (scheduler.js가 크론으로 자동 실행)
      │  ad-collector/data/*.json 에 저장
      │  (이미지·영상·스크린샷은 ad-collector/output/ 에 저장, S3 설정 시 업로드 후 로컬 삭제)
      ▼
node sync-data.js  (ad-collector/data, output → ad-ref/public/data 로 복사)
      │
      ▼
[ad-ref] Next.js 대시보드가 public/data 의 정적 JSON을 읽어서 화면에 표시
```

ad-ref는 `output: 'export'`(정적 export) 모드로 빌드됩니다. 서버에서 실시간으로 API를
호출하는 구조가 아니라, **수집기가 만든 JSON 파일을 그대로 읽어서 보여주는 방식**입니다.
(단, Claude 인사이트용 API 라우트만 예외 — "5. 인사이트 생성 방식" 참고)

`sync-data.js`는 자동으로 실행되지 않습니다. 수집이 끝난 뒤 사람이 직접
`cd ad-ref && node sync-data.js`를 실행해야 대시보드에 최신 데이터가 반영됩니다.

---

## 2. 대시보드 탭별 설명

사이드바는 5개 그룹으로 나뉩니다.

### 뉴스 클리핑
- **데일리 뉴스**: 팀에서 관리하는 구글 시트(뉴스 모니터링 백업)를 연동해 매일 클리핑 내용을 보여줍니다.
- **주간 뉴스 인사이트**: 월 선택 → 그 달의 주차를 칩으로 골라 주간 단위 뉴스 인사이트를 봅니다.
- **북마크**: 클리핑 중 저장해둔 항목 모아보기.

구글 Apps Script 웹앱(JSONP)을 통해 데이터를 가져오며, 접근 안정성 이슈가 과거에 있었던
적이 있습니다(현재는 해결된 것으로 보이나 원인이 명확히 밝혀지진 않음). 다시 문제가 생기면
시트를 CSV로 직접 읽는 방식으로 우회할 수 있습니다(`[WB]메리츠증권 뉴스 모니터링 백업`
시트의 "데일리_분석"/"주간_분석" 탭). 북마크/피드백/실시간 접속 같은 쓰기 기능은 CSV
우회 방식으로는 지원되지 않습니다.

### 크리에이티브
- **전체**: 메타+구글 소재를 플랫폼/브랜드/기간으로 필터링해서 카드 그리드로 보여줍니다.
  상단 KPI(활성/신규/종료/즐겨찾기), 브랜드별 KPI 매트릭스, 경쟁사 바로가기, Claude 소재
  인사이트가 함께 표시됩니다. 화면엔 최근 150개만 그리고(성능), 브랜드를 클릭하면 그
  브랜드의 전체 소재를 다 볼 수 있습니다.
- **메타 / 구글**: 각 매체만 따로, 기간(시작~종료일) 필터와 광고주 슬라이서가 추가로 있습니다.
- **즐겨찾기**: 즐겨찾기한 소재를 폴더별로 모아봅니다.

### 모니터링
- **브랜드검색**: 네이버 브랜드검색(PC/모바일) 스크린샷과, 그 안의 버튼을 실제로 클릭해서
  받아온 랜딩페이지 스크린샷을 브랜드별로 보여줍니다. 한 번 수집할 때 페이지를 6회
  새로고침하며 신규 소재만 골라 누적하고, PC/모바일 소재는 문구 유사도로 자동 매칭해서
  같은 `creativeSetId`로 묶어 보여줍니다.
- **검색광고 일반키워드**: "증권"/"주식" 키워드로 네이버 파워링크 검색 시 뜨는 광고를 그대로
  보여줍니다. 키워드 경매라 우리 브랜드가 아닌 광고주도 섞여 나오는 게 정상입니다(경쟁 구도
  파악용). 주차별 인사이트가 함께 표시됩니다.
- **검색광고 브랜드키워드**: 9개 브랜드명 자체를 검색어로 파워링크를 검색하되, 그 브랜드
  본인이 낸 광고만 걸러서 보여줍니다(`brandUtils.js`의 `matchesBrand`). 브랜드×기기마다
  30회 새로고침하며 로테이션 소재를 누적하고, 하나도 안 잡히면 "광고 미집행 중"으로 표시.

### 트렌드
- **검색어 트렌드**: 네이버 데이터랩 검색량 추이를 브랜드별로 비교하고, 코스피/코스닥/
  나스닥 지수와 함께 보여줍니다. Claude 인사이트가 함께 표시됩니다.
- **트렌드 리포트**: 팀이 관리하는 구글 시트(앱별 월간 MAU/신규설치 등)를 그대로 가져와
  표/그래프로 보여줍니다.
- **커뮤니티 반응**: 디시인사이드 주식갤러리·에펨코리아·뽐뿌 증권포럼·클리앙 주식한담·
  아카라이브 주식 채널·더쿠 주식·블라인드 주식/투자 — 실제 커뮤니티 7곳 글만 근거로(웹서치
  미사용) 매일 화제 키워드 TOP15를 뽑아 감정 분류(긍정/중립/부정)와 상대적 언급량을 보여줍니다.
  캘린더로 과거 날짜 조회, TOP10 전일比·7일 추이 스파크라인 포함.

### 업무 보고 *(2026-08-13 신설)*
- **경쟁사 동향 보고**: 매월 25일 주간 리포트 대상 — 네이버 타임보드/스페셜DA, 유튜브 채널
  소재, ATL(tvcf.co.kr) 현황을 월별 드롭다운 + 매체별(타임보드/스페셜DA/유튜브/ATL) 아코디언
  구조로 보여줍니다. 데이터 소스는 3가지가 섞여 있습니다:
  - **타임보드/스페셜DA**: 자동 캡처 (아래 "4. 스케줄러 시간표" 참고)
  - **유튜브**: YouTube Data API 연동 예정 (settings.json의 `youtubeApiKey` 필요, 아직 미연동)
  - **ATL, 그리고 위 자동화 결과의 팀 리뷰용 백업**: 구글 시트 4탭(타임보드/스페셜DA/유튜브/ATL)에서
    읽어옴 — 시트 URL은 `ad-collector/scrapers/competitorTrendSheet.js`의 `SHEET_ID` 참고.
    ATL은 대행사가 스크린샷으로 자동 수집이 불가능해(아래 "8. 알려진 제약사항" 참고) 팀이
    직접 시트에 입력하는 방식으로 운영합니다.

---

## 3. 데이터 흐름/구동 방식

- 모든 수집 결과는 `ad-collector/data/*.json`에 저장됩니다 (`index.json`, `bs_index.json`,
  `powerlink_index.json`, `powerlink_brand_index.json`, `community_trend.json`,
  `competitor_trend_report.json` 등 종류별로 파일이 나뉨).
- 광고 이미지·영상·스크린샷 실물 파일은 `ad-collector/output/` 아래 저장됩니다
  (`images/meta/`, `images/google/`, `screenshots/` 등). 각 데이터 항목의
  `localPath`/`localImage`/`screenshotPath`/`imageUrl` 필드가 이 상대경로를 가리킵니다.
- **S3 호환 스토리지 지원(선택)**: `ad-collector/.env`에 `S3_ENDPOINT`, `S3_REGION`,
  `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` 6개 값을
  채우면 로컬 대신 S3에 업로드하고 공개 URL을 그대로 저장합니다. 하나라도 비어있으면
  로컬 저장 그대로 동작합니다(`.env.example` 참고). **미완료 상태 — 아직 실제 계정/버킷
  미발급, 이미지가 Vercel에서 안 뜨는 원인.**
- `node sync-data.js`(ad-ref 폴더 안에서 실행)가 위 JSON과 미디어 파일을
  `ad-ref/public/data/`로 미러링(원본에 없어진 파일은 대상에서도 삭제)합니다. S3 사용 시
  미디어 파일 복사는 건너뜁니다.
- **구글 시트 연동은 전부 "읽기 전용, 인증 불필요" 방식**입니다: 시트를 "링크가 있는 모든
  사용자 → 뷰어"로 공유해두면, `/gviz/tq?tqx=out:csv&sheet=탭이름` 형태의 공개 URL로
  인증 없이 CSV를 받아올 수 있습니다(트렌드 리포트, 경쟁사 동향 시트가 이 방식). **시트에
  자동으로 값을 "쓰는" 기능이 필요할 때만** Google Apps Script 웹앱 배포가 필요합니다
  (`ad-collector/CompetitorTrendCode.gs`가 그 템플릿 — 현재는 안 쓰는 중, 위 경쟁사 동향
  시트는 전부 읽기만 함).

---

## 4. 스케줄러 시간표

`ad-collector/scheduler.js`가 아래 전부를 cron으로 관리합니다. **로그온 시 자동 시작은
안 되어 있어서** 컴퓨터를 켤 때마다 `ad-collector/start-scheduler.bat`을 한 번 실행해야
합니다(완전히 독립된 콘솔 창으로 떠서, 그 창을 띄운 터미널이 나중에 닫혀도 계속 돕니다).

| 시각 | 무엇을 | 비고 |
|---|---|---|
| 매 정시 | 네이버 타임보드(PC)/스페셜DA(모바일) 캡처 + Claude Vision 판별 | 신규(2026-08-13). 상품이 1시간 단위 판매라 정각 캡처면 슬롯 안 놓침 |
| 짝수 시 정각 | 메타 브랜드 9개 중 3개씩 순환 확인 | Apify 아닌 Playwright, 과금 없음 |
| 홀수 시 정각 | 메타 광고 이미지/영상 채우기 | 상세페이지 방문 |
| 07:00 | 구글 이미지 다운로드 실패분 복구 | `googleMediaBackfill.js` |
| 07:30 | 구글 이미지 OCR 텍스트 백필 (200건/일) | `googleTextBackfill.js` |
| 07:35 | 구글 이미지 소재 설명(aiDescription) 백필 (300건/일) | `googleDescriptionBackfill.js` |
| 07:45 | 구글 마지막 게재일 백필 | `googleLastShownBackfill.js` (종료 처리된 광고만) |
| 07:50 | 날짜 없는 구글 종료 소재 2025-01-01 추정치 채우기 | `noDateFallbackBackfill.js` |
| 09:30 | 코스피/코스닥/나스닥 지수 | Yahoo Finance 공개 API |
| 09:30 | 트렌드 리포트(앱별 MAU/신규설치) | 구글 시트 연동 |
| 09:30 | 커뮤니티 반응(화제 키워드+감정분류) | 실제 커뮤니티 7곳 스크랩, 웹서치 미사용 |
| 09:30 | 경쟁사 동향 시트 동기화 | 타임보드/스페셜DA/유튜브/ATL 4탭 → 대시보드 반영 |
| 11:00 (주 1회) | 메타 광고("증권" 키워드, Apify) | 이번 주 첫 평일에만 (**유일하게 과금되는 수집**) |
| 11:00 (주 1회) | 구글 광고(브랜드 9개) | 이번 주 첫 평일에만 |
| 11:00 (주 1회) | 검색광고 일반키워드(파워링크) | 이번 주 첫 평일에만 |
| 11:00 (주 1회) | 네이버 브랜드검색 + 검색광고 브랜드키워드 | 이번 주 첫 평일에만 |

**공휴일 처리**: 주 1회짜리 4개(메타/구글/파워링크 일반·브랜드/브랜드검색)는 크론 자체는
매일 11시에 돌지만, `scheduleUtils.js`의 `isFirstBusinessDayOfWeek()`가 "이번 주 첫
평일(공휴일 제외)"인지 확인해서 그날만 실제로 수집합니다 — 월요일이 공휴일이면 화요일로
자동으로 밀립니다. 공휴일 목록(`ad-collector/holidays.js`)에서 음력 기반 공휴일(설날/추석/
부처님오신날)은 연도별 추정치이므로 매년 말 다음 해 날짜를 확인/추가해야 합니다.

`sync-data.js`는 스케줄에 포함되어 있지 않습니다 — 수집된 내용을 대시보드에 반영하려면
수동으로 실행해야 하고, Vercel에 반영하려면 추가로 git commit/push까지 필요합니다.

---

## 5. 인사이트 생성 방식

소재 인사이트/파워링크 인사이트/검색어 트렌드 인사이트/커뮤니티 반응 인사이트 등 여러
곳에서 같은 규칙을 씁니다.

1. **호출 방식**: `ad-collector/insightClient.js`의 `generateInsight()`가
   `execFileSync('claude', ['-p', prompt, ...])`로 로컬에 설치된 **Claude Code CLI**를
   비대화형으로 호출합니다. 기본은 `--allowedTools WebSearch`를 붙이지만,
   `{allowWebSearch: false}`로 웹 검색 자체를 막을 수도 있습니다(커뮤니티 반응 화제
   키워드는 이 옵션으로 막아서, 우리가 직접 스크랩한 글만 근거로 쓰게 강제함).
2. **인증**: 2026-08-13부터 **팀 공용 Anthropic API 키**를 씁니다. `ad-ref/.env.local`의
   `ANTHROPIC_API_KEY`에 값이 들어있으면 `claude` CLI가 이를 자동으로 읽어서 인증합니다.
   ⚠️ **주의**: 이 값은 `sk-ant-api03-`로 시작하는 **일반 API 키** 형식이라
   `ANTHROPIC_API_KEY`에 넣어야 합니다 — `CLAUDE_CODE_OAUTH_TOKEN`(다른 형식의 OAuth 세션
   토큰용 변수)에 넣으면 "OAuth access token has expired" 오류가 납니다. 새 팀원이 이
   프로젝트를 셋업할 때 `.env.local`에 직접 넣어야 하는 값입니다(git에 커밋 안 됨).
3. **포맷 규칙**: 모든 인사이트 프롬프트는 `buildInsightPrompt()`로 감싸서 "첫 줄 = 한 문장
   요약, 그 아래 `- `로 시작하는 핵심 포인트 3~5개" 형식을 강제합니다. `InsightBox`
   컴포넌트가 이 포맷을 파싱해서 렌더링합니다. 분석할 소재가 3개 미만이면 Claude를 호출하지
   않고 "인사이트 없음"으로 바로 저장합니다(비용 절감).
4. **생성 시점 - 두 가지**:
   - **수집 시점에 미리 생성 → JSON에 저장** (파워링크 인사이트, 커뮤니티 반응 인사이트):
     스케줄러가 수집 직후 자동 호출, 대시보드는 저장된 텍스트만 보여줌.
   - **화면 버튼으로 그때그때 생성** (크리에이티브 '전체' 탭 소재 인사이트, 검색어 트렌드
     인사이트): `ad-ref/src/app/api/*/route.ts` API 라우트가 현재 필터 조건으로 매번 새로
     생성. 정적 export로 안 되고 실제 Node 서버가 필요한 유일한 부분.
5. **텍스트 없는 소재(주로 구글 이미지 광고)는 이미지를 직접 읽게 함**: 구글 광고 투명성
   센터가 이미지형 소재에 카피 텍스트를 안 주기 때문에, 로컬 이미지 경로를 프롬프트에 같이
   넘겨 Claude가 직접 봅니다. 한 번에 최대 6장까지만 보내서, 소재가 많은 브랜드는 매번 일부만
   보고 인사이트를 만드는 한계가 있습니다.

---

## 6. 서버/배포 안내

**로컬 개발 서버**: `ad-ref/`에서 `npm run dev` (포트 3000). `ad-collector`의 수집기는
Vercel과 무관하게 특정 컴퓨터에서 스케줄러로 상시 실행되어야 합니다(현재 팀원 PC에서
`start-scheduler.bat` 수동 실행 중).

**Vercel 배포**: `alvinpark-cell/ad-collector-data`(origin) 저장소를 개인 Vercel 계정에
연결해 배포함(`ad-collector-data.vercel.app`). 모노레포라 **Root Directory를 반드시
`ad-ref`로 지정**해야 합니다(기본값 `./`로는 빌드 안 됨).

- **데이터가 실시간 아님**: 평소 `ad-ref/public/data/*.json`은 gitignore 대상인데, Vercel이
  git 저장소를 그대로 빌드하는 구조라 예외적으로 커밋해둔 상태입니다. 즉 로컬 수집이 계속
  새로 되어도 `git push`를 해야만 Vercel에 반영됩니다.
- **이미지/스크린샷 실물 파일은 안 올라감**: `ad-ref/.vercelignore`가 `public/data/images/`,
  `public/data/screenshots/`를 제외합니다(15,000여 개 파일, 700MB+). 카드에 플레이스홀더만
  보입니다. S3 마이그레이션이 완료되면 자동 해결됨(아직 미완료).
- **Claude 인사이트 API 라우트**: Vercel 프로젝트 설정에 `ANTHROPIC_API_KEY` 환경변수를
  등록해야 동작합니다(로컬 `.env.local`과 별개로 Vercel 대시보드에서 등록 필요) — 등록
  여부 미확인, 데모에서 인사이트 버튼을 누르면 에러가 날 수 있습니다.

---

## 7. 폴더 구조

- 수집기 설치/실행 방법: [`ad-collector/README.md`](ad-collector/README.md)
- 대시보드 개발 서버 실행: `ad-ref/`에서 `npm run dev`
- 설정 파일 예시: [`ad-collector/settings.example.json`](ad-collector/settings.example.json),
  [`ad-collector/.env.example`](ad-collector/.env.example) (실제 값을 채운 뒤 각각
  `settings.json`/`.env`로 파일명 변경 — 둘 다 git에는 안 올라감)
- `ad-collector/scrapers/` — 수집/동기화 스크립트 모음 (매체별 스크래퍼, 시트 동기화 등)
- `ad-collector/data/` — 수집 결과 JSON (git ignore)
- `ad-collector/output/` — 이미지/영상/스크린샷 실물 파일 (git ignore)
- `ad-ref/src/components/` — 탭별 화면 컴포넌트
- `ad-ref/public/data/` — sync-data.js가 복사해 넣는 대시보드용 정적 데이터 (Vercel용으로만 예외적 커밋)

---

## 8. 현재 알려진 제약사항

- **GFA(네이버)/카카오디스플레이 자동 수집 불가능**: 타겟팅·실시간 경매 기반 광고라 공개
  광고 아카이브가 없고, 스크래핑 봇은 특정 유저 세그먼트로 인식될 수 없어 우연히도 못 봄.
  계정 리포트(네이버 GFA 매니저, 카카오모먼트)를 팀이 직접 받아 시트/파일로 넣는 방식만 가능.
- **ATL(tvcf.co.kr) 자동 스크래핑 불가능**: 사이트 전체(홈페이지 포함)에 자동화 탐지 봇
  방어가 걸려 있어, User-Agent 위장/실제 Chrome/쿠키 이식 등 시도했지만 전부 403으로 차단됨.
  팀이 직접 확인해 구글 시트 ATL 탭에 수동 입력하는 방식으로 운영.
- **네이버 타임보드/스페셜DA는 "시간대 통째 판매" 상품이라 자동 캡처 가능**: 특정 시간에
  접속하는 모든 사람이 같은 광고를 보므로(타겟팅 아님) 정시 캡처로 잡을 수 있음 — 위
  "4. 스케줄러 시간표" 참고. 반대로 GFA/카카오는 이 특성이 없어서 안 됨.
- **로그온 시 스케줄러 자동 시작 미설정**: `start-scheduler.bat`을 컴퓨터 켤 때마다 수동
  실행해야 함. Windows 작업 스케줄러 등록이 아직 안 되어 있음.
- **이미지/스크린샷 S3 마이그레이션 미완료**: 로컬 파일 기반이라 Vercel 배포마다 이미지가
  깨짐. 계정/버킷만 발급되면 `ad-collector/storage.js`가 바로 동작함.
- **유튜브 API 미연동**: `settings.json`의 `youtubeApiKey`에 키는 등록돼 있으나, 채널별
  영상 수집 스크립트는 아직 작성 전.
- **뉴스 클리핑 쓰기 기능(북마크/피드백/실시간 접속) 미검증**: 읽기는 확인했지만 실제
  클릭 테스트는 아직 안 해봄.
- **구글 NH투자증권/KB증권 누적 수집 0건 원인 미상**: 광고 투명성 센터에 등록된 정확한
  광고주명이 다를 가능성 — 원인 특정 못함.

---

## 9. 팀 온보딩 체크리스트

새로 이 프로젝트를 맡는 개발자가 로컬에서 처음 셋업할 때 필요한 것들입니다.

1. **`ad-collector/settings.json`** 생성 (`settings.example.json` 복사 후 값 채우기)
   - `brands`, `keywords` 등은 이미 채워져 있음
   - `apifyAccount1Token`/`apifyAccount2Token` — Apify 계정 토큰 (메타 수집용)
   - `youtubeApiKey` — YouTube Data API v3 키 ([console.cloud.google.com](https://console.cloud.google.com)에서 발급, 무료)
   - `appsScriptUrl` — 즐겨찾기 공유용(현재 미사용, 비워둬도 됨)
2. **`ad-collector/.env`** 생성 (`.env.example` 복사) — S3 쓸 경우에만 6개 값 채움, 안 쓰면 비워둬도 로컬 저장으로 동작
3. **`ad-ref/.env.local`** 생성 — 아래 값 필요:
   - `ANTHROPIC_API_KEY` — 팀 공용 Anthropic API 키 (Claude 인사이트 생성용, 위 "5. 인사이트 생성 방식" 참고)
   - `NAVER_DATALAB_CLIENT_ID` / `NAVER_DATALAB_CLIENT_SECRET` — 검색어 트렌드 탭용
4. **Playwright 브라우저 설치**: `ad-collector`에서 `npx playwright install chromium`
5. **`claude` CLI 설치 + 위 API 키 인식 확인**: `claude -p "1+1?" --output-format text` 실행해서 정상 응답 오는지 확인
6. **스케줄러 실행**: `ad-collector`에서 `start-scheduler.bat` 더블클릭 (또는 `node scheduler.js`)
7. **대시보드 개발 서버**: `ad-ref`에서 `npm install` → `npm run dev`
8. **최초 데이터 채우기**: `ad-collector`에서 `node collector.js`로 한 번 수집 후, `ad-ref`에서 `node sync-data.js`
