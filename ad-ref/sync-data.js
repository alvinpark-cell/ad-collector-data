/**
 * 수집된 데이터를 Next.js 앱의 public/data 폴더로 동기화
 * ad-collector 폴더와 ad-ref 폴더가 같은 위치에 있어야 함
 * 
 * 실행: node sync-data.js
 */

const fs = require('fs');
const path = require('path');

// 경로 설정 (같은 폴더 안의 ad-collector)
const collectorDir = path.join(__dirname, '..', 'ad-collector'); // 실제 폴더명으로 변경
const nextPublicDir = path.join(__dirname, 'public', 'data');

// ad-collector/storage.js를 그대로 가져와서 S3 활성화 여부만 확인한다 - 이 모듈이 이미
// ad-collector/.env를 읽어서 판단해주므로 여기서 따로 환경변수 로딩 로직을 만들 필요가 없다.
// S3가 켜져있으면 item.localPath 등이 이미 공개 URL이라 로컬 output/images·screenshots엔
// 업로드 실패한 것들만 남아있는 상태라, 그 폴더를 통째로 복사할 이유가 없다.
const { isS3Enabled } = require(path.join(collectorDir, 'storage.js'));

function syncData() {
  console.log('데이터 동기화 시작...');

  // public/data 폴더 생성
  if (!fs.existsSync(nextPublicDir)) {
    fs.mkdirSync(nextPublicDir, { recursive: true });
  }
  if (!fs.existsSync(path.join(nextPublicDir, 'images'))) {
    fs.mkdirSync(path.join(nextPublicDir, 'images'), { recursive: true });
  }

  // index.json 복사
  const indexSrc = path.join(collectorDir, 'data', 'index.json');
  const indexDst = path.join(nextPublicDir, 'index.json');
  // changes.json 복사
  const changesSrc = path.join(collectorDir, 'data', 'changes.json');
  const changesDst = path.join(nextPublicDir, 'changes.json');
  if (fs.existsSync(changesSrc)) {
    fs.copyFileSync(changesSrc, changesDst);
    console.log('changes.json 복사 완료');
  } else {
    fs.writeFileSync(changesDst, JSON.stringify({newAds:[],endedAds:[],lastUpdated:null}));
  }

  if (fs.existsSync(indexSrc)) {
    fs.copyFileSync(indexSrc, indexDst);
    const count = JSON.parse(fs.readFileSync(indexSrc, 'utf-8')).length;
    console.log(`index.json 복사 완료: ${count}개 항목`);
  } else {
    console.log('index.json 없음 - 빈 배열로 생성');
    fs.writeFileSync(indexDst, '[]');
  }

  // bs_index.json 복사 (브랜드검색)
  const bsSrc = path.join(collectorDir, 'data', 'bs_index.json');
  const bsDst = path.join(nextPublicDir, 'bs_index.json');
  if (fs.existsSync(bsSrc)) {
    fs.copyFileSync(bsSrc, bsDst);
    console.log('bs_index.json 복사 완료');
  } else {
    fs.writeFileSync(bsDst, '[]');
  }

  // powerlink_index.json 복사 (파워링크 모니터링)
  const pwlSrc = path.join(collectorDir, 'data', 'powerlink_index.json');
  const pwlDst = path.join(nextPublicDir, 'powerlink_index.json');
  if (fs.existsSync(pwlSrc)) {
    fs.copyFileSync(pwlSrc, pwlDst);
    console.log('powerlink_index.json 복사 완료');
  } else {
    fs.writeFileSync(pwlDst, '[]');
  }

  // collection_status.json 복사 (각 수집 종류별 마지막 수집 시각/건수 - 홈 화면 표시용)
  const statusSrc = path.join(collectorDir, 'data', 'collection_status.json');
  const statusDst = path.join(nextPublicDir, 'collection_status.json');
  if (fs.existsSync(statusSrc)) {
    fs.copyFileSync(statusSrc, statusDst);
    console.log('collection_status.json 복사 완료');
  } else {
    fs.writeFileSync(statusDst, '{}');
  }

  // market_index.json 복사 (코스피/코스닥/나스닥 - 검색어 트렌드 화면 상단)
  const marketSrc = path.join(collectorDir, 'data', 'market_index.json');
  const marketDst = path.join(nextPublicDir, 'market_index.json');
  if (fs.existsSync(marketSrc)) {
    fs.copyFileSync(marketSrc, marketDst);
    console.log('market_index.json 복사 완료');
  } else {
    fs.writeFileSync(marketDst, '{}');
  }

  // powerlink_insight.json 복사 (파워링크 주차별 변화 인사이트)
  const pwlInsightSrc = path.join(collectorDir, 'data', 'powerlink_insight.json');
  const pwlInsightDst = path.join(nextPublicDir, 'powerlink_insight.json');
  if (fs.existsSync(pwlInsightSrc)) {
    fs.copyFileSync(pwlInsightSrc, pwlInsightDst);
    console.log('powerlink_insight.json 복사 완료');
  } else {
    fs.writeFileSync(pwlInsightDst, '{}');
  }

  // creative_insight.json 복사 (소재 인사이트 - 전체/브랜드별)
  const creativeInsightSrc = path.join(collectorDir, 'data', 'creative_insight.json');
  const creativeInsightDst = path.join(nextPublicDir, 'creative_insight.json');
  if (fs.existsSync(creativeInsightSrc)) {
    fs.copyFileSync(creativeInsightSrc, creativeInsightDst);
    console.log('creative_insight.json 복사 완료');
  } else {
    fs.writeFileSync(creativeInsightDst, '{}');
  }

  // powerlink_brand_index.json / powerlink_brand_insight.json 복사 (검색광고 브랜드키워드)
  const pwlBrandSrc = path.join(collectorDir, 'data', 'powerlink_brand_index.json');
  const pwlBrandDst = path.join(nextPublicDir, 'powerlink_brand_index.json');
  if (fs.existsSync(pwlBrandSrc)) {
    fs.copyFileSync(pwlBrandSrc, pwlBrandDst);
    console.log('powerlink_brand_index.json 복사 완료');
  } else {
    fs.writeFileSync(pwlBrandDst, '[]');
  }
  const pwlBrandInsightSrc = path.join(collectorDir, 'data', 'powerlink_brand_insight.json');
  const pwlBrandInsightDst = path.join(nextPublicDir, 'powerlink_brand_insight.json');
  if (fs.existsSync(pwlBrandInsightSrc)) {
    fs.copyFileSync(pwlBrandInsightSrc, pwlBrandInsightDst);
    console.log('powerlink_brand_insight.json 복사 완료');
  } else {
    fs.writeFileSync(pwlBrandInsightDst, '{}');
  }

  // trend_report.json 복사 (트렌드 리포트 - 구글 시트에서 받아온 앱별 MAU/신규설치)
  const trendReportSrc = path.join(collectorDir, 'data', 'trend_report.json');
  const trendReportDst = path.join(nextPublicDir, 'trend_report.json');
  if (fs.existsSync(trendReportSrc)) {
    fs.copyFileSync(trendReportSrc, trendReportDst);
    console.log('trend_report.json 복사 완료');
  } else {
    fs.writeFileSync(trendReportDst, '{"records":[]}');
  }

  // community_trend.json 복사 (커뮤니티 반응 - 버블차트)
  const communitySrc = path.join(collectorDir, 'data', 'community_trend.json');
  const communityDst = path.join(nextPublicDir, 'community_trend.json');
  if (fs.existsSync(communitySrc)) {
    fs.copyFileSync(communitySrc, communityDst);
    console.log('community_trend.json 복사 완료');
  } else {
    fs.writeFileSync(communityDst, '{"general":[],"brand":[]}');
  }

  if (isS3Enabled()) {
    console.log('S3 스토리지 사용 중 - 이미지/스크린샷 로컬 복사는 건너뜁니다 (localPath가 이미 공개 URL)');
  } else {
    // 이미지 폴더 동기화 (심볼릭 링크 또는 복사)
    const imgSrc = path.join(collectorDir, 'output', 'images');
    const imgDst = path.join(nextPublicDir, 'images');
    if (fs.existsSync(imgSrc)) {
      copyDirSync(imgSrc, imgDst);
      console.log('이미지 폴더 동기화 완료');
    }

    // 스크린샷 폴더 동기화 (브랜드검색)
    const ssSrc = path.join(collectorDir, 'output', 'screenshots');
    const ssDst = path.join(nextPublicDir, 'screenshots');
    if (fs.existsSync(ssSrc)) {
      copyDirSync(ssSrc, ssDst);
      console.log('스크린샷 폴더 동기화 완료');
    }
  }

  console.log('동기화 완료!');
}

// 진짜 미러링: src에 없는 dst 파일/폴더는 삭제한다.
// (예전엔 새 파일만 추가하고 지워진 원본은 절대 안 지워서, ad-collector 쪽에서
//  중복 제거/정리된 이미지·영상이 ad-ref/public/data에는 계속 남아 몇 GB씩 쌓였음 - 2026-08-03 정리)
function copyDirSync(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });

  const srcNames = new Set(fs.existsSync(src) ? fs.readdirSync(src) : []);

  fs.readdirSync(dst).forEach(name => {
    if (srcNames.has(name)) return;
    const dstFile = path.join(dst, name);
    fs.rmSync(dstFile, { recursive: true, force: true });
  });

  srcNames.forEach(file => {
    const srcFile = path.join(src, file);
    const dstFile = path.join(dst, file);
    if (fs.statSync(srcFile).isDirectory()) {
      copyDirSync(srcFile, dstFile);
    } else {
      // 이미 존재하면 스킵 (속도 향상)
      if (!fs.existsSync(dstFile)) {
        fs.copyFileSync(srcFile, dstFile);
      }
    }
  });
}

syncData();
