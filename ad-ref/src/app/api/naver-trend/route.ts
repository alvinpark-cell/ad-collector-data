import { NextRequest, NextResponse } from 'next/server';

interface KeywordGroup {
  groupName: string;
  keywords: string[];
}

export async function POST(req: NextRequest) {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'NAVER_DATALAB_CLIENT_ID/SECRET이 .env.local에 설정되지 않았습니다' },
      { status: 500 }
    );
  }

  let body: { startDate: string; endDate: string; timeUnit: string; keywordGroups: KeywordGroup[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 });
  }

  const { startDate, endDate, timeUnit, keywordGroups } = body;
  if (!startDate || !endDate || !timeUnit || !Array.isArray(keywordGroups) || keywordGroups.length === 0) {
    return NextResponse.json({ error: 'startDate/endDate/timeUnit/keywordGroups가 모두 필요합니다' }, { status: 400 });
  }
  if (keywordGroups.length > 5) {
    return NextResponse.json({ error: '네이버 데이터랩 API는 키워드 그룹을 최대 5개까지만 지원합니다' }, { status: 400 });
  }

  try {
    const naverRes = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ startDate, endDate, timeUnit, keywordGroups }),
    });

    const data = await naverRes.json();
    if (!naverRes.ok) {
      return NextResponse.json({ error: data.errorMessage || data.message || '네이버 API 오류' }, { status: naverRes.status });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '알 수 없는 오류' }, { status: 500 });
  }
}
