'use client';

export type Sentiment = 'positive' | 'neutral' | 'negative';
interface BubbleDatum { keyword: string; count: number; sentiment?: Sentiment; }

const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: '#e6483f',
  neutral: '#8888aa',
  negative: '#3aa0e0',
};
const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: '긍정 언급', neutral: '중립 언급', negative: '부정 언급',
};
const MAX_CIRCLES = 15;

// 원 "면적"이 언급량에 비례하도록 반지름은 sqrt(값)에 비례시킨다(면적 = πr², 사람 눈은
// 면적으로 크기를 인지하므로 이게 표준적인 버블차트 스케일링 방식). 로그 스케일은 값이
// 수십~수천 배씩 차이날 때만 의미가 있는데, 지금처럼 값들이 비슷한 자릿수(수백~천)에
// 몰려있으면 로그가 차이를 거의 다 눌러버려서 원 크기가 다 똑같아 보이는 문제가 있었음.
//
// count/maxCount 비율만 쓰면(예전 방식) 최솟값이 0에 가깝지 않은 이상 반지름이 minR까지
// 안 내려가서(예: 최소가 최대의 60%면 반지름도 60%대에 머묾) 화면에 실제로 뜬 항목들
// 사이의 크기 차이가 잘 안 느껴지는 문제가 있었다(2026-08-05 확인). 그래서 지금 화면에
// 뜨는 항목들의 실제 최소~최대로 먼저 0~1로 정규화한 뒤 sqrt를 적용 - 이러면 가장 작은
// 항목은 항상 minR, 가장 큰 항목은 항상 maxR을 써서 주어진 반지름 범위를 최대로 활용한다.
function radiusFor(count: number, minCount: number, maxCount: number, minR: number, maxR: number) {
  if (maxCount <= minCount) return (minR + maxR) / 2;
  const norm = (Math.max(count, minCount) - minCount) / (maxCount - minCount);
  const ratio = Math.sqrt(norm);
  return minR + ratio * (maxR - minR);
}

// 폰트 크기 하한을 9px에서 11px로 올렸더니(2026-08-05, 작은 원 글씨 안 보임 피드백)
// 예전의 "중간 지점 근처 공백에서 2줄로만 접기" 방식으로는 긴 키워드가 안전 폭에 안
// 맞는 경우가 늘어서, 그 초과분을 글자 단위로 그냥 잘라버리면 단어 중간이 잘리는
// 문제가 생겼다(2026-08-05 재확인). 그래서 "단어(공백/가운데점 기준) 단위로 줄이
// 넘치기 직전까지 채우고 다음 줄로 넘기는" 정식 그리디 워드랩으로 교체 - 항상 단어
// 경계에서만 줄이 바뀌고, 최대 3줄까지 허용한다.
const FONT_FLOOR = 11;
const FONT_CEIL = 19;
const MAX_LINES = 3;

// 가운데점(·)으로 이어진 긴 합성어(예: "사이드카·서킷브레이커")는 공백이 없어서 그
// 자체로 한 "단어"면 줄바꿈 기회가 없다 - · 뒤를 부드러운 줄바꿈 지점으로 취급해서
// 쪼갠다(가운데점 자체는 앞 조각에 붙여서 의미가 안 끊기게 유지).
function splitWords(keyword: string): string[] {
  return keyword.split(' ').flatMap(token => {
    if (!token.includes('·')) return [token];
    const idx = token.indexOf('·');
    return [token.slice(0, idx + 1), token.slice(idx + 1)].filter(Boolean);
  });
}

// 주어진 폰트 크기 기준으로 단어들을 안전 폭 안에서 그리디하게 줄바꿈한다 - 단어 중간이
// 아니라 항상 단어와 단어 사이에서만 줄이 나뉜다.
function wrapToLines(words: string[], fontSize: number, safeWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(safeWidth / (fontSize * 0.95)));
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// 원 반지름에 맞는 최대 폰트 크기와, 그 크기로 단어 경계만 지켜서 접은 줄들을 함께 정한다.
// 큰 폰트부터 내려가며 "줄 수가 MAX_LINES 이내 + 세로로도 다 들어감"을 만족하는 첫 크기를
// 쓰고, 하한(FONT_FLOOR)까지 내려도 안 맞으면 그 크기로 MAX_LINES까지만 자르고 마지막
// 줄만 말줄임(…) 처리한다(단어 자체가 안전 폭보다 긴 극단적인 경우의 최후 방어선).
function layoutBubbleText(keyword: string, r: number): { fontSize: number; lines: string[] } {
  const safeWidth = r * Math.SQRT2 * 0.86;
  const safeHeight = r * Math.SQRT2 * 0.86;
  const words = splitWords(keyword);

  for (let fontSize = FONT_CEIL; fontSize >= FONT_FLOOR; fontSize -= 0.5) {
    const lines = wrapToLines(words, fontSize, safeWidth);
    const lineHeight = fontSize * 1.15;
    if (lines.length <= MAX_LINES && lines.length * lineHeight <= safeHeight) {
      return { fontSize, lines };
    }
  }

  const lines = wrapToLines(words, FONT_FLOOR, safeWidth).slice(0, MAX_LINES);
  const maxChars = Math.max(1, Math.floor(safeWidth / (FONT_FLOOR * 0.95)));
  const lastIdx = lines.length - 1;
  if (lastIdx >= 0 && lines[lastIdx].length > maxChars) {
    lines[lastIdx] = maxChars <= 1 ? lines[lastIdx].slice(0, 1) + '…' : lines[lastIdx].slice(0, maxChars - 1) + '…';
  }
  return { fontSize: FONT_FLOOR, lines };
}

interface PackItem { r: number; datum: BubbleDatum; color: string; }
interface PackedCircle extends PackItem { x: number; y: number; }

// 원끼리 서로 맞닿아 뭉쳐있는 형태(circle packing) - 정식 아폴로니안 packing 알고리즘 대신,
// "이미 놓인 원들 가장자리를 따라 여러 각도를 시도해보고 겹치지 않으면서 중심에 가장 가까운
// 자리를 고른다"는 그리디 방식으로 근사한다. 원이 15개 안팎이라 이 정도로도 충분히 자연스럽게
// 뭉친 모양이 나오고 계산량도 O(n^2)라 가볍다.
function packCircles(items: PackItem[]): PackedCircle[] {
  const sorted = [...items].sort((a, b) => b.r - a.r);
  const placed: PackedCircle[] = [];
  const ANGLE_STEP_DEG = 4;

  sorted.forEach((item) => {
    if (placed.length === 0) {
      placed.push({ ...item, x: 0, y: 0 });
      return;
    }
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const anchor of placed) {
      const dist = anchor.r + item.r;
      for (let deg = 0; deg < 360; deg += ANGLE_STEP_DEG) {
        const rad = (deg * Math.PI) / 180;
        const cx = anchor.x + dist * Math.cos(rad);
        const cy = anchor.y + dist * Math.sin(rad);
        const overlaps = placed.some(p => {
          const dx = p.x - cx, dy = p.y - cy;
          return Math.sqrt(dx * dx + dy * dy) < p.r + item.r - 0.5;
        });
        if (overlaps) continue;
        const distFromOrigin = Math.sqrt(cx * cx + cy * cy);
        if (distFromOrigin < bestDist) {
          bestDist = distFromOrigin;
          best = { x: cx, y: cy };
        }
      }
    }
    placed.push({ ...item, x: best ? best.x : placed.length * (item.r * 2 + 10), y: best ? best.y : 0 });
  });

  return placed;
}

export default function BubbleChart({ data }: { data: BubbleDatum[] }) {
  const capped = data.slice(0, MAX_CIRCLES);
  if (capped.length === 0) {
    return <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>데이터 없음</div>;
  }

  const minR = 42, maxR = 108;
  const counts = capped.map(d => d.count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts, 1);
  const items: PackItem[] = capped.map(d => ({
    r: radiusFor(d.count, minCount, maxCount, minR, maxR),
    datum: d,
    color: SENTIMENT_COLOR[d.sentiment || 'neutral'],
  }));
  const packed = packCircles(items);

  const padding = maxR * 0.6;
  const minX = Math.min(...packed.map(p => p.x - p.r)) - padding;
  const maxX = Math.max(...packed.map(p => p.x + p.r)) + padding;
  const minY = Math.min(...packed.map(p => p.y - p.r)) - padding;
  const maxY = Math.max(...packed.map(p => p.y + p.r)) + padding;

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        {(Object.keys(SENTIMENT_COLOR) as Sentiment[]).map(s => (
          <span key={s} style={{ fontSize: '14px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: SENTIMENT_COLOR[s], display: 'inline-block' }} />
            {SENTIMENT_LABEL[s]}
          </span>
        ))}
      </div>
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} style={{ width: '100%', height: '440px' }}>
        {packed.map(p => {
          const { fontSize, lines } = layoutBubbleText(p.datum.keyword, p.r);
          const lineHeight = fontSize * 1.15;
          const totalTextHeight = lines.length * lineHeight;
          const firstLineY = p.y - totalTextHeight / 2 + lineHeight / 2;
          return (
            <g key={p.datum.keyword}>
              <circle cx={p.x} cy={p.y} r={p.r} fill={p.color} style={{ fillOpacity: 'var(--bubble-fill-opacity)' }} stroke={p.color} strokeWidth="2" />
              {lines.map((line, i) => (
                <text key={i} x={p.x} y={firstLineY + i * lineHeight} textAnchor="middle" dominantBaseline="middle"
                  fontSize={fontSize} fontWeight={700} fill="#f5f5fa">
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
