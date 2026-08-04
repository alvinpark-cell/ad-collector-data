/**
 * Claude Code CLI를 스크립트에서 비대화형으로 호출하는 공용 헬퍼.
 * 별도 Anthropic API 키/계정 없이 지금 로그인된 Claude Code(Pro 등) 구독 그대로 사용한다.
 * (주의: 인터랙티브 세션과 사용량을 공유하므로, 너무 자주/크게 호출하면 한도에 영향 줄 수 있음)
 */

const { execFileSync } = require('child_process');

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

module.exports = { generateInsight };
