/**
 * data/index.json에 이미 저장된 "염승환 이사" 등 스캠 광고를 1회성으로 제거한다.
 * processItems.js에 이제 같은 필터가 적용돼 있어 앞으로는 저장 시점에 걸러지지만,
 * 이미 들어간 기존 항목은 별도로 지워줘야 한다. 실행: node cleanup-scam-ads.js
 */
const path = require('path');
const { loadIndex, saveIndex } = require('./utils');
const { isJunkAdvertiser } = require('./brandUtils');
const settings = require('./settings.json');

const INDEX_PATH = path.join(settings.dataDir, 'index.json');
const index = loadIndex(INDEX_PATH);

const removed = index.filter(i => isJunkAdvertiser(i.advertiserName, i.copyText, settings.advertiserDenylist));
const kept = index.filter(i => !isJunkAdvertiser(i.advertiserName, i.copyText, settings.advertiserDenylist));

console.log(`전체 ${index.length}건 중 스캠 ${removed.length}건 제거, ${kept.length}건 유지`);
removed.slice(0, 5).forEach(i => console.log('  - 제거:', i.advertiserName));

saveIndex(INDEX_PATH, kept);
console.log('data/index.json 갱신 완료');
