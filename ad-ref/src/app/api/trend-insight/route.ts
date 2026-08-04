import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';

// naver-trend와 마찬가지로 POST라 정적 export(output:'export') 아래서도 dev/일반 서버로
// 돌릴 때는 문제없이 동작한다 (GET 라우트만 force-static 요구사항에 걸림).
// 별도 Anthropic API 키 없이, 이 서버 프로세스에서 로그인된 Claude Code CLI를 그대로 호출한다.
export async function POST(req: NextRequest) {
  let body: { dataLabResults: unknown; marketIndexSummary: unknown; brands: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 });
  }

  const prompt = '다음은 브랜드별 네이버 검색어 트렌드(상대 검색량 지수)와 같은 기간의 코스피/코스닥/나스닥 지수 등락률 데이터야. ' +
    '검색량 추이와 지수 등락 사이에 관련 있어 보이는 지점이 있는지, 특이하게 튀는 구간이 있다면 언제인지를 3~4문장으로 ' +
    '한국어로 설명해줘. 확실치 않으면 추측이라고 밝히고, 마크다운 없이 평문으로 답해줘.';

  try {
    const stdout = execFileSync('claude', ['-p', prompt, '--output-format', 'text'], {
      input: JSON.stringify(body, null, 2),
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 20,
      timeout: 60000,
    });
    return NextResponse.json({ text: stdout.trim() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Claude 호출 실패' }, { status: 500 });
  }
}
