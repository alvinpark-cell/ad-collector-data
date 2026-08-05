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
function radiusFor(count: number, maxCount: number, minR: number, maxR: number) {
  if (maxCount <= 0) return minR;
  const ratio = Math.sqrt(Math.max(count, 0) / maxCount);
  return minR + ratio * (maxR - minR);
}

// 화제 키워드가 "코스피 급등락(롤러코스피 변동성)"처럼 긴 구문인 경우가 많아서, 한 줄에
// 다 안 들어가면 공백 기준으로 2줄까지 나눠 접는다. 나눌 공백이 없으면(아주 긴 단일
// 단어) 한 줄로 두고 폰트 크기 계산 쪽에서 더 작게 줄인다.
function wrapKeyword(keyword: string): string[] {
  if (keyword.length <= 7) return [keyword];
  const mid = Math.floor(keyword.length / 2);
  let splitAt = keyword.lastIndexOf(' ', mid);
  if (splitAt <= 0) splitAt = keyword.indexOf(' ', mid);
  if (splitAt <= 0) return [keyword];
  return [keyword.slice(0, splitAt).trim(), keyword.slice(splitAt + 1).trim()];
}

// 원 안에 텍스트가 넘치지 않도록, 원의 "안전 폭"(가로/세로 대각선 기준 내접 정사각형 한 변)에
// 가장 긴 줄이 맞춰지도록 폰트 크기를 역산한다. 한글은 폭이 거의 정사각형(글자당 약 0.95em)
// 이라 이 근사치로 충분히 정확하다.
function fitFontSize(lines: string[], r: number, reserveForCount: boolean): number {
  const safeWidth = r * Math.SQRT2 * 0.86;
  const safeHeight = (r * Math.SQRT2 * 0.86) / (lines.length + (reserveForCount ? 0.7 : 0));
  const longest = Math.max(...lines.map(l => l.length), 1);
  const byWidth = safeWidth / (longest * 0.95);
  return Math.max(9, Math.min(19, byWidth, safeHeight));
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

  const minR = 34, maxR = 100;
  const maxCount = Math.max(...capped.map(d => d.count), 1);
  const items: PackItem[] = capped.map(d => ({
    r: radiusFor(d.count, maxCount, minR, maxR),
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
          const showCount = p.r >= 42;
          const lines = wrapKeyword(p.datum.keyword);
          const fontSize = fitFontSize(lines, p.r, showCount);
          const lineHeight = fontSize * 1.15;
          const totalTextHeight = lines.length * lineHeight;
          const firstLineY = p.y - totalTextHeight / 2 + lineHeight / 2 - (showCount ? fontSize * 0.55 : 0);
          return (
            <g key={p.datum.keyword}>
              <circle cx={p.x} cy={p.y} r={p.r} fill={p.color} fillOpacity={0.32} stroke={p.color} strokeWidth="2" />
              {lines.map((line, i) => (
                <text key={i} x={p.x} y={firstLineY + i * lineHeight} textAnchor="middle" dominantBaseline="middle"
                  fontSize={fontSize} fontWeight={700} fill="#f5f5fa">
                  {line}
                </text>
              ))}
              {showCount && (
                <text x={p.x} y={firstLineY + lines.length * lineHeight + fontSize * 0.15} textAnchor="middle" dominantBaseline="middle"
                  fontSize={fontSize * 0.72} fill="#d8d8e4">
                  {p.datum.count.toLocaleString()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
