/**
 * 소재 인사이트 - 수집된 메타/구글 광고 소재(copyText/headline 등)를 Claude CLI로 분석해서
 * "어떤 키워드/테마로 광고하고 있는지", "이번 달 새로 늘어난 소재는 어떤 내용인지",
 * "어느 브랜드가 광고를 많이 돌렸는지" 같은 인사이트를 생성한다.
 *
 * 슬라이서(년도/월/광고주/매체) 조합이 무한하기 때문에 전부 실시간 생성은 안 하고,
 * "전체 기준"과 "브랜드별" 두 단위로 미리 생성해서 저장해둔다 - 화면에서 슬라이서로
 * 브랜드 1개만 선택했을 때 그 브랜드 인사이트를, 아니면 전체 인사이트를 보여주는 방식.
 */

const fs = require('fs');
const path = require('path');
const { loadIndex } = require('../utils');
const { generateInsight } = require('../insightClient');

function toRow(item) {
  return {
    광고주: item.advertiserName || item.keyword,
    매체: item.platform,
    문구: (item.copyText || '').slice(0, 200),
    헤드라인: item.headline || '',
    상태: item.status,
    수집월: (item.collectedAt || '').slice(0, 7),
  };
}

const OVERALL_PROMPT = '다음은 증권사 경쟁사 광고 소재 목록이야(광고주/매체/문구/헤드라인/상태/수집월 포함). ' +
  '이 데이터를 보고 1) 주로 어떤 키워드/테마(예: 이벤트, ISA, 계좌개설, 수수료 등)로 광고를 운영 중인지, ' +
  '2) 어느 브랜드가 소재를 가장 많이 운영 중인지, 3) 종료된 광고와 진행 중인 광고 비중은 어떤지를 ' +
  '4~6문장으로 한국어로 요약해줘. 마크다운 없이 평문으로, 숫자를 근거로 들어서 설명해줘.';

const BRAND_PROMPT_TEMPLATE = (brand) => `다음은 "${brand}"의 광고 소재 목록이야(매체/문구/헤드라인/상태/수집월 포함). ` +
  '이 브랜드가 주로 어떤 키워드/테마로 광고를 운영 중인지, 소재가 몇 개나 있고 그중 진행 중/종료는 몇 개인지를 ' +
  '3~4문장으로 한국어로 요약해줘. 마크다운 없이 평문으로.';

async function updateCreativeInsight(settings) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const data = loadIndex(indexPath);
  if (data.length === 0) {
    console.log('[소재 인사이트] 데이터가 없어 건너뜀');
    return null;
  }

  const result = { updatedAt: new Date().toISOString(), overall: null, byBrand: {} };

  try {
    result.overall = {
      text: await generateInsight(OVERALL_PROMPT, data.map(toRow)),
      itemCount: data.length,
    };
    console.log('[소재 인사이트] 전체 기준 생성 완료');
  } catch (e) {
    console.error('[소재 인사이트] 전체 기준 오류:', e.message);
  }

  for (const brand of settings.brands || []) {
    const brandItems = data.filter(d =>
      (d.advertiserName || '').toLowerCase().includes(brand.toLowerCase()) ||
      (d.keyword || '').toLowerCase() === brand.toLowerCase()
    );
    if (brandItems.length === 0) continue;
    try {
      result.byBrand[brand] = {
        text: await generateInsight(BRAND_PROMPT_TEMPLATE(brand), brandItems.map(toRow)),
        itemCount: brandItems.length,
      };
      console.log(`[소재 인사이트] "${brand}" 생성 완료 (${brandItems.length}건)`);
    } catch (e) {
      console.error(`[소재 인사이트] "${brand}" 오류:`, e.message);
    }
  }

  const outPath = path.join(settings.dataDir, 'creative_insight.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log('[소재 인사이트] creative_insight.json 갱신 완료');
  return result;
}

module.exports = { updateCreativeInsight };
if (require.main === module) {
  const settings = require('../settings.json');
  updateCreativeInsight(settings).catch(err => { console.error('오류:', err); process.exit(1); });
}
