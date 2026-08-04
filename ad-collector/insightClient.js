/**
 * Claude Code CLI를 스크립트에서 비대화형으로 호출하는 공용 헬퍼.
 * 별도 Anthropic API 키/계정 없이 지금 로그인된 Claude Code(Pro 등) 구독 그대로 사용한다.
 * (주의: 인터랙티브 세션과 사용량을 공유하므로, 너무 자주/크게 호출하면 한도에 영향 줄 수 있음)
 */

const { execFileSync } = require('child_process');

// 모든 인사이트(소재/파워링크/트렌드)가 "줄글"이 아니라 한눈에 훑어볼 수 있는
// 요약+불릿 형태로 나오도록 강제하는 공통 포맷 규칙. 소재가 부족하면 억지로
// 인사이트를 지어내지 말고 그대로 "인사이트 없음"이라고만 답하게 한다.
const INSIGHT_FORMAT_RULE = '\n\n반드시 이 형식으로만 답해: 첫 줄에 핵심을 한 문장으로 ' +
  '요약하고, 그 다음 줄부터 각 줄을 "- "로 시작하는 핵심 포인트 3~5개로 적어줘. ' +
  '마크다운 볼드/헤더/번호매김 없이 이 형식만 지켜줘. 분석할 만큼 유의미한 소재가 ' +
  '부족하면 다른 말 없이 정확히 "인사이트 없음"이라고만 답해.';

function buildInsightPrompt(basePrompt) {
  return basePrompt + INSIGHT_FORMAT_RULE;
}

// Claude 호출 전에 소재 개수부터 거르는 임계치 - 너무 적으면 호출 자체를 안 해서
// 비용도 아끼고, 억지 인사이트가 나오는 것도 미리 막는다.
const MIN_ITEMS_FOR_INSIGHT = 3;
const NO_INSIGHT_TEXT = '인사이트 없음';

function hasEnoughDataForInsight(itemCount) {
  return itemCount >= MIN_ITEMS_FOR_INSIGHT;
}

/**
 * @param {string} promptText - 지시문(프롬프트)
 * @param {any} dataPayload - stdin으로 흘려보낼 데이터 (객체면 JSON.stringify, 문자열이면 그대로)
 * @returns {string} Claude가 생성한 텍스트 (trim됨)
 */
function generateInsight(promptText, dataPayload) {
  const input = dataPayload == null
    ? undefined
    : (typeof dataPayload === 'string' ? dataPayload : JSON.stringify(dataPayload, null, 2));
  try {
    const result = execFileSync('claude', ['-p', promptText, '--output-format', 'text'], {
      input,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 20,
      timeout: 120000,
    });
    return result.trim();
  } catch (e) {
    throw new Error(`Claude CLI 호출 실패: ${e.message}`);
  }
}

module.exports = { generateInsight, buildInsightPrompt, hasEnoughDataForInsight, NO_INSIGHT_TEXT, MIN_ITEMS_FOR_INSIGHT };
