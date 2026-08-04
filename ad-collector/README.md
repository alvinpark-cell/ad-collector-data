# 📊 ad-collector — 광고 레퍼런스 자동 수집기

Meta(Facebook/Instagram), Google 광고 투명성 센터, 네이버(브랜드검색/파워링크)에서
메리츠증권 + 경쟁 증권사 9곳 광고를 자동 수집합니다. 수집 결과는 `data/*.json`에
저장되고, 실제로 팀이 보는 화면은 이 폴더가 아니라 옆의 `ad-ref/` 대시보드입니다
(자세한 전체 구조는 저장소 루트의 [`../README.md`](../README.md) 참고).

---

## 🚀 처음 설치하기 (딱 한 번만)

### 1. Node.js 설치
https://nodejs.org 에서 **LTS 버전** 다운로드 후 설치

### 2. 패키지 설치
```
cd ad-collector
npm install
npm run install-browser
```

### 3. 설정 파일 만들기
`settings.example.json`을 복사해서 `settings.json`으로 이름을 바꾸고 값을 채우세요
(`settings.json`은 실제 Apify API 키가 들어가서 git에는 올라가지 않습니다).

```
copy settings.example.json settings.json
```

주요 항목:
- **brands**: 경쟁 증권사 9곳 브랜드명 목록
- **keywords / powerlinkKeywords**: 일반 키워드 수집에 쓸 검색어
- **apifyAccount1Token / apifyAccount2Token**: Meta 광고 메타데이터 수집용 Apify 계정 토큰
- **advertiserDenylist**: 스캠성 광고(특정 인물명 사칭 등) 걸러내는 차단 키워드

### 4. (선택) S3 호환 스토리지 연결
`.env.example`을 복사해서 `.env`로 이름을 바꾸고 6개 값(`S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`)을 채우면
수집된 이미지/영상/스크린샷이 로컬 대신 S3에 저장됩니다. 안 채우면 지금처럼
`output/` 폴더에 로컬로 저장됩니다.

### 5. (선택) 인사이트 생성을 위한 Claude CLI 로그인
파워링크/소재/커뮤니티 반응 인사이트는 이 컴퓨터에 설치된 `claude` CLI를 그대로
호출합니다. `claude` 명령이 로그인되어 있어야 인사이트가 생성됩니다 (안 되어 있어도
수집 자체는 정상 동작하고, 인사이트만 "인사이트 없음"으로 남습니다).

---

## ▶️ 실행하기

```
npm run collect      # 지금 바로 한 번 수집
npm run schedule      # 스케줄러 실행 (켜둔 채로 유지해야 함 - 아래 주기대로 자동 수집)
```

`npm run schedule`가 관리하는 자동 수집 주기는 저장소 루트 README의 "수집 대상 및
주기" 표를 참고하세요.

수집 후 대시보드에 반영하려면 `ad-ref` 폴더에서 `node sync-data.js`를 실행해야 합니다
(자동으로 실행되지 않습니다).

---

## 📁 결과물 확인

```
data/            ← 수집된 광고 데이터 (JSON)
output/
  images/        ← Meta/Google 광고 이미지·영상
  screenshots/   ← 네이버 브랜드검색/파워링크 스크린샷
```

이 JSON/이미지를 사람이 직접 보는 게 아니라, `ad-ref` 대시보드가 `sync-data.js`로
복사해간 사본을 읽어서 화면에 보여줍니다.

---

## ❓ 자주 묻는 질문

**Q: 처음 수집이 너무 오래 걸려요**
A: 정상입니다. 브랜드 9개 × 여러 매체를 전부 긁어오기 때문에 처음엔 시간이 걸립니다.
두 번째부터는 중복 제거로 훨씬 빠릅니다.

**Q: 인사이트가 계속 "인사이트 없음"이라고 나와요**
A: 소재가 3개 미만이면 원래 그렇게 나옵니다(정상). 소재가 충분한데도 그렇다면 `claude`
CLI 로그인 상태를 확인해주세요.

**Q: 스케줄러가 자동 수집이 안 돼요**
A: 컴퓨터(또는 서버)가 켜져 있고 `npm run schedule` 프로세스가 계속 실행 중이어야 합니다.

---

## 📞 추가 기능 요청

키워드/브랜드 추가, 새 매체 추가 등은 언제든지 말씀해주세요!
