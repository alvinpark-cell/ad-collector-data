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
const { generateInsight, buildInsightPrompt, hasEnoughDataForInsight, NO_INSIGHT_TEXT } = require('../insightClient');
const { matchesBrand } = require('../brandUtils');

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

// 브랜드 1개에 소재가 수백~천 건씩 쌓이는 경우(예: 메리츠증권 1000건+) 전부 그대로
// Claude에 넘기면 응답이 느려지거나(실측: 전체 1534건 호출은 타임아웃) 데이터가 너무
// 커서 Claude가 "인사이트 없음"으로 보수적으로 답하는 경우가 있었다. 문구+헤드라인
// 조합이 같은 중복 소재를 먼저 합치고, 그래도 많으면 대표 샘플만 추려서 보낸다.
const MAX_ROWS_FOR_INSIGHT = 150;
// 구글 소재는 텍스트(copyText/headline)가 거의 항상 비어있다 - Google Ads Transparency
// Center 자체가 이미지/영상형 소재의 카피를 텍스트로 노출하지 않기 때문. 이 경우 유일한
// 단서는 실제로 다운로드해둔 이미지 파일뿐이라, Claude Code CLI의 Read 툴(이미지 열람 가능,
// 실측 확인됨)로 로컬 이미지를 직접 보게 하고 그 안의 문구/소구점을 분석에 반영한다.
const MAX_IMAGES_FOR_INSIGHT = 6;

function sampleForInsight(items, settings) {
  const withText = items.filter(d => (d.copyText || '').trim() || (d.headline || '').trim());
  const seen = new Set();
  const deduped = [];
  for (const item of withText) {
    const key = `${item.copyText || ''}::${item.headline || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  const sampled = deduped.length > MAX_ROWS_FOR_INSIGHT ? deduped.slice(0, MAX_ROWS_FOR_INSIGHT) : deduped;

  // 텍스트가 없는 항목 중 실제로 로컬에 다운로드된 이미지가 있는 것만 후보로 - 다운로드
  // 실패해서 localPath가 없는 항목은 원격 URL뿐이라 Read 툴로 열어볼 수 없다.
  const noTextWithImage = items.filter(d =>
    !((d.copyText || '').trim() || (d.headline || '').trim()) && d.localPath && d.mediaType === 'image'
  );
  const imagePaths = noTextWithImage.slice(0, MAX_IMAGES_FOR_INSIGHT).map(d => path.resolve(settings.outputDir, d.localPath));

  return {
    rows: sampled.map(toRow),
    isTextSampled: sampled.length < withText.length,
    imagePaths,
    noImageTextlessCount: items.length - withText.length - noTextWithImage.length,
  };
}

const SAMPLE_NOTE = ' (문구가 같은 중복 소재는 합쳤고, 그래도 많으면 대표 소재 일부만 보여준 것이니 ' +
  '건수 얘기할 땐 알려준 전체 건수를 기준으로 말해줘.)';

function imageNote(imagePaths, noImageTextlessCount) {
  if (imagePaths.length === 0) {
    return noImageTextlessCount > 0
      ? `\n\n참고로 문구 데이터가 없는 소재가 ${noImageTextlessCount}건 더 있는데, 로컬에 이미지 파일도 없어서 내용 확인이 불가능해. 이 건들은 "내용 확인 불가"로만 언급하고 분석에서는 제외해줘.`
      : '';
  }
  return `\n\n그리고 아래 로컬 이미지 파일들도 반드시 하나씩 열어서 봐줘 - 이 소재들은 문구 데이터가 비어있어서 ` +
    `실제 카피/소구점이 이미지 안에만 있어. 이미지에서 읽은 문구나 메시지도 위 데이터와 함께 분석에 반영해줘:\n` +
    imagePaths.map(p => `- ${p}`).join('\n');
}

const OVERALL_PROMPT = (isSampled, imagePaths, noImageTextlessCount) => buildInsightPrompt(
  '다음은 증권사 경쟁사 광고 소재 목록이야(광고주/매체/문구/헤드라인/상태/수집월 포함).' + (isSampled ? SAMPLE_NOTE : '') +
  ' 이 데이터를 보고 1) 주로 어떤 키워드/테마(예: 이벤트, ISA, 계좌개설, 수수료 등)로 광고를 운영 중인지, ' +
  '2) 어느 브랜드가 소재를 가장 많이 운영 중인지, 3) 종료된 광고와 진행 중인 광고 비중은 어떤지를 ' +
  '한국어로 정리해줘. 숫자를 근거로 들어서 설명해줘.' + imageNote(imagePaths, noImageTextlessCount)
);

const BRAND_PROMPT_TEMPLATE = (brand, isSampled, imagePaths, noImageTextlessCount) => buildInsightPrompt(
  `다음은 "${brand}"의 광고 소재 목록이야(매체/문구/헤드라인/상태/수집월 포함).` + (isSampled ? SAMPLE_NOTE : '') +
  ' 이 브랜드가 주로 어떤 키워드/테마로 광고를 운영 중인지, 소재가 몇 개나 있고 그중 진행 중/종료는 몇 개인지를 ' +
  '한국어로 정리해줘.' + imageNote(imagePaths, noImageTextlessCount)
);

async function updateCreativeInsight(settings) {
  const indexPath = path.join(settings.dataDir, 'index.json');
  const data = loadIndex(indexPath);
  if (data.length === 0) {
    console.log('[소재 인사이트] 데이터가 없어 건너뜀');
    return null;
  }

  const result = { updatedAt: new Date().toISOString(), overall: null, byBrand: {} };

  if (!hasEnoughDataForInsight(data.length)) {
    result.overall = { text: NO_INSIGHT_TEXT, itemCount: data.length };
  } else {
    const { rows, isTextSampled, imagePaths, noImageTextlessCount } = sampleForInsight(data, settings);
    if (rows.length === 0 && imagePaths.length === 0) {
      result.overall = { text: NO_INSIGHT_TEXT, itemCount: data.length };
    } else {
      try {
        result.overall = {
          text: await generateInsight(OVERALL_PROMPT(isTextSampled, imagePaths, noImageTextlessCount), rows),
          itemCount: data.length,
        };
        console.log('[소재 인사이트] 전체 기준 생성 완료' + (isTextSampled ? ` (텍스트 샘플 ${rows.length}건` : ' (텍스트 ' + rows.length + '건') + `, 이미지 ${imagePaths.length}건)`);
      } catch (e) {
        console.error('[소재 인사이트] 전체 기준 오류:', e.message);
      }
    }
  }

  for (const brand of settings.brands || []) {
    const brandItems = data.filter(d =>
      matchesBrand(d.advertiserName, brand) ||
      (d.keyword || '').toLowerCase() === brand.toLowerCase()
    );
    if (brandItems.length === 0) continue;
    if (!hasEnoughDataForInsight(brandItems.length)) {
      result.byBrand[brand] = { text: NO_INSIGHT_TEXT, itemCount: brandItems.length };
      continue;
    }
    const { rows, isTextSampled, imagePaths, noImageTextlessCount } = sampleForInsight(brandItems, settings);
    if (rows.length === 0 && imagePaths.length === 0) {
      result.byBrand[brand] = { text: NO_INSIGHT_TEXT, itemCount: brandItems.length };
      continue;
    }
    try {
      result.byBrand[brand] = {
        text: await generateInsight(BRAND_PROMPT_TEMPLATE(brand, isTextSampled, imagePaths, noImageTextlessCount), rows),
        itemCount: brandItems.length,
      };
      console.log(`[소재 인사이트] "${brand}" 생성 완료 (${brandItems.length}건, 텍스트 ${rows.length}건, 이미지 ${imagePaths.length}건)`);
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
