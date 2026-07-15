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

  console.log('동기화 완료!');
}

function copyDirSync(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src).forEach(file => {
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
