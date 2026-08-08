import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import path from 'path';

// trend-insight와 동일하게 POST라 정적 export(output:'export') 아래서도 dev/일반 서버로
// 돌릴 때는 문제없이 동작한다. 대시보드에서 "지금 선택된 조건(광고주/월/매체 슬라이서 +
// 검색어)"으로 필터링된 결과를 그대로 보내주면, 그 결과만 가지고 매번 새로 인사이트를
// 생성한다 - 브랜드별로 미리 만들어둔 고정 인사이트가 아니라 사용자가 클릭한 조합에 따라
// 계속 바뀌는 인사이트를 원해서 이렇게 바꿈.
interface CreativeItem {
  advertiserName?: string; platform?: string; copyText?: string; headline?: string;
  status?: string; collectedAt?: string; localPath?: string; mediaType?: string;
  aiDescription?: string;
}

const MAX_ROWS = 150;
const MAX_IMAGES = 6;

// aiDescription은 googleDescriptionBackfill.js가 문구 없는(모델/비주얼 위주) 구글 소재를
// 미리 이미지 분석해서 채워둔 값 - copyText/headline이 비어있으면 이걸로 대체한다.
function toRow(item: CreativeItem) {
  const hasRealText = (item.copyText || '').trim() || (item.headline || '').trim();
  return {
    광고주: item.advertiserName || '', 매체: item.platform || '',
    문구: hasRealText ? (item.copyText || '').slice(0, 200) : (item.aiDescription || '').slice(0, 200),
    헤드라인: item.headline || '',
    상태: item.status || '', 수집월: (item.collectedAt || '').slice(0, 7),
  };
}

export async function POST(req: NextRequest) {
  let body: { items: CreativeItem[]; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 });
  }

  const items = body.items || [];
  if (items.length === 0) {
    return NextResponse.json({ text: '인사이트 없음', itemCount: 0 });
  }

  // 문구가 같은 중복 소재는 합치고, 그래도 많으면 대표만 샘플링 (aiDescription으로 대체된
  // 것도 "텍스트 있음"으로 취급 - toRow()가 이미 그 값을 문구 자리에 채워준다)
  const withText = items.filter(i => (i.copyText || '').trim() || (i.headline || '').trim() || (i.aiDescription || '').trim());
  const seen = new Set<string>();
  const deduped: CreativeItem[] = [];
  for (const it of withText) {
    const key = `${it.copyText || ''}::${it.headline || ''}::${it.aiDescription || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }
  const sampled = deduped.length > MAX_ROWS ? deduped.slice(0, MAX_ROWS) : deduped;
  const isSampled = sampled.length < withText.length;
  const rows = sampled.map(toRow);

  // 텍스트도 aiDescription도 없는(아직 디스크립션 백필 안 된) 구글 소재만, 로컬에 받아둔
  // 이미지가 있으면 Claude가 직접 열어서 그 자리에서 읽어내도록 경로를 넘긴다 (public/data
  // 밑에 sync-data.js가 복사해둔 실제 파일). aiDescription이 이미 있으면 다시 이미지를
  // 보낼 필요 없음(비용/시간 절약) - localPath가 S3 공개 URL(http로 시작)이면 로컬엔
  // 파일이 없으니 제외한다.
  const noTextWithImage = items.filter(i =>
    !((i.copyText || '').trim() || (i.headline || '').trim() || (i.aiDescription || '').trim()) && i.localPath &&
    i.mediaType === 'image' && !/^https?:\/\//i.test(i.localPath)
  );
  const imagePaths = noTextWithImage.slice(0, MAX_IMAGES).map(i => path.join(process.cwd(), 'public', 'data', i.localPath!));

  if (rows.length === 0 && imagePaths.length === 0) {
    return NextResponse.json({ text: '인사이트 없음', itemCount: items.length });
  }

  const sampleNote = isSampled
    ? ' (문구가 같은 중복 소재는 합쳤고, 그래도 많으면 대표 소재 일부만 보여준 것이니 건수 얘기할 땐 알려준 전체 건수를 기준으로 말해줘.)'
    : '';
  const imageNote = imagePaths.length > 0
    ? '\n\n그리고 아래 로컬 이미지 파일들도 반드시 하나씩 열어서 봐줘 - 이 소재들은 문구 데이터가 비어있어서 실제 카피/소구점이 ' +
      '이미지 안에만 있어. 이미지에서 읽은 문구나 메시지도 위 데이터와 함께 분석에 반영해줘:\n' + imagePaths.map(p => `- ${p}`).join('\n')
    : '';

  const scopeLabel = body.label ? `"${body.label}" 조건으로 필터링된` : '현재 선택된 조건으로 필터링된';
  const prompt = `다음은 ${scopeLabel} 증권사 경쟁사 광고 소재 목록이야(광고주/매체/문구/헤드라인/상태/수집월 포함, 전체 ${items.length}건 중 대표 샘플).` +
    sampleNote +
    ' 이 데이터를 보고 주로 어떤 키워드/테마로 광고를 운영 중인지, 어떤 소구점이 두드러지는지, 진행중/종료 비중은 어떤지를 한국어로 정리해줘. ' +
    '반드시 이 형식으로만 답해: 첫 줄에 핵심을 한 문장으로 요약하고, 그 다음 줄부터 각 줄을 "- "로 시작하는 핵심 포인트 3~5개로 적어줘. ' +
    '마크다운 볼드/헤더/번호매김 없이 이 형식만 지켜줘. 분석할 만큼 유의미한 소재가 부족하면 다른 말 없이 정확히 "인사이트 없음"이라고만 답해.' +
    imageNote;

  try {
    const stdout = execFileSync('claude', ['-p', prompt, '--output-format', 'text'], {
      input: JSON.stringify(rows, null, 2),
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 20,
      timeout: 120000,
    });
    return NextResponse.json({ text: stdout.trim(), itemCount: items.length });
  } catch (e) {
    // execFileSync 에러 메시지에는 프롬프트 전체를 포함한 명령어 전체가 그대로 들어있어서
    // (Node 기본 동작) 그걸 그대로 노출하면 화면이 프롬프트로 도배된다. claude CLI는 로그인
    // 안 됐을 때 "Not logged in · Please run /login" 같은 실제 원인을 stderr가 아니라
    // stdout으로 찍길래(실측 확인) stdout도 같이 본다 - 둘 다 없을 때만 명령어 메시지의
    // 첫 줄로 대체한다.
    const errObj = e as { stderr?: unknown; stdout?: unknown };
    const stderr = errObj && typeof errObj === 'object' && 'stderr' in errObj ? String(errObj.stderr || '').trim() : '';
    const stdoutMsg = errObj && typeof errObj === 'object' && 'stdout' in errObj ? String(errObj.stdout || '').trim() : '';
    const message = stderr || stdoutMsg || (e instanceof Error ? e.message.split('\n')[0] : 'Claude 호출 실패');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
