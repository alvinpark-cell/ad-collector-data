'use client';

interface BubbleDatum { keyword: string; count: number; }

const COLORS = ['#6c63ff', '#03c75a', '#e0a030', '#e05a7a', '#3aa0e0', '#a78bfa', '#34d399', '#f472b6', '#facc15'];

// 절대 언급량이 아니라 상대적 관심도를 보여주는 용도라 로그 스케일로 반지름을 정해서
// 극단적으로 큰 값(예: 인베스팅닷컴 검색결과 수천 건) 하나가 나머지를 다 작은 점으로
// 만들어버리는 걸 완화한다.
function radiusFor(count: number, maxCount: number, minR: number, maxR: number) {
  const logMax = Math.log(maxCount + 1);
  if (logMax === 0) return minR;
  const logV = Math.log(count + 1);
  return minR + (logV / logMax) * (maxR - minR);
}

interface PackItem { r: number; datum: BubbleDatum; color: string; }
interface PackedCircle extends PackItem { x: number; y: number; }

// 원끼리 서로 맞닿아 뭉쳐있는 형태(circle packing) - 정식 아폴로니안 packing 알고리즘 대신,
// "이미 놓인 원들 가장자리를 따라 여러 각도를 시도해보고 겹치지 않으면서 중심에 가장 가까운
// 자리를 고른다"는 그리디 방식으로 근사한다. 원이 9개 안팎이라 이 정도로도 충분히 자연스럽게
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
  if (data.length === 0) {
    return <div style={{ padding: '30px', textAlign: 'center', color: '#8888aa', fontSize: '12px' }}>데이터 없음</div>;
  }

  const minR = 22, maxR = 72;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const items: PackItem[] = data.map((d, i) => ({
    r: radiusFor(d.count, maxCount, minR, maxR),
    datum: d,
    color: COLORS[i % COLORS.length],
  }));
  const packed = packCircles(items);

  const padding = maxR * 0.6;
  const minX = Math.min(...packed.map(p => p.x - p.r)) - padding;
  const maxX = Math.max(...packed.map(p => p.x + p.r)) + padding;
  const minY = Math.min(...packed.map(p => p.y - p.r)) - padding;
  const maxY = Math.max(...packed.map(p => p.y + p.r)) + padding;

  return (
    <div>
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} style={{ width: '100%', height: '320px' }}>
        {packed.map(p => {
          const fontSize = Math.max(10, Math.min(16, p.r * 0.34));
          const showCount = p.r >= 34;
          return (
            <g key={p.datum.keyword}>
              <circle cx={p.x} cy={p.y} r={p.r} fill={p.color} fillOpacity={0.32} stroke={p.color} strokeWidth="2" />
              <text x={p.x} y={p.y + (showCount ? -fontSize * 0.35 : 0)} textAnchor="middle" dominantBaseline="middle"
                fontSize={fontSize} fontWeight={700} fill="#f0f0f8">
                {p.datum.keyword}
              </text>
              {showCount && (
                <text x={p.x} y={p.y + fontSize * 0.75} textAnchor="middle" dominantBaseline="middle"
                  fontSize={fontSize * 0.72} fill="#c4c4d4">
                  {p.datum.count.toLocaleString()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', marginTop: '6px' }}>
        {packed
          .slice()
          .sort((a, b) => b.datum.count - a.datum.count)
          .map(p => (
            <span key={p.datum.keyword} style={{ fontSize: '12px', color: '#c4c4d4', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color, display: 'inline-block' }} />
              {p.datum.keyword} <span style={{ color: '#8888aa' }}>({p.datum.count.toLocaleString()})</span>
            </span>
          ))}
      </div>
    </div>
  );
}
