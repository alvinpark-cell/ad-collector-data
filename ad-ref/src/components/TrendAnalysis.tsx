'use client';

import { useState, useMemo } from 'react';

interface TrendAnalysisProps {
  brands: string[];
  clientBrand: string;
}

interface DataLabPoint {
  period: string;
  ratio: number;
}

interface DataLabResult {
  title: string;
  keywords: string[];
  data: DataLabPoint[];
}

const LINE_COLORS = ['#6c63ff', '#03c75a', '#e0a030', '#e05a7a', '#3aa0e0'];

function toApiDate(d: string) {
  return d; // <input type="date"> already gives YYYY-MM-DD, which the API accepts
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export default function TrendAnalysis({ brands, clientBrand }: TrendAnalysisProps) {
  const { start, end } = useMemo(() => defaultDateRange(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set([clientBrand]));
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  const [timeUnit, setTimeUnit] = useState<'date' | 'week' | 'month'>('month');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DataLabResult[] | null>(null);

  const toggleBrand = (brand: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(brand)) {
        next.delete(brand);
      } else {
        if (next.size >= 5) return prev; // 네이버 API 제한: 그룹 최대 5개
        next.add(brand);
      }
      return next;
    });
  };

  const runQuery = async () => {
    if (selected.size === 0) { setError('브랜드를 최소 1개 선택해주세요'); return; }
    setLoading(true);
    setError(null);
    try {
      const keywordGroups = Array.from(selected).map(brand => ({ groupName: brand, keywords: [brand] }));
      const res = await fetch('/api/naver-trend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: toApiDate(startDate),
          endDate: toApiDate(endDate),
          timeUnit,
          keywordGroups,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setResults(data.results || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  // 차트 좌표 계산
  const chart = useMemo(() => {
    if (!results || results.length === 0) return null;
    const allPoints = results.flatMap(r => r.data);
    if (allPoints.length === 0) return null;
    const periods = results[0].data.map(d => d.period);
    const maxRatio = Math.max(...allPoints.map(p => p.ratio), 1);

    const width = 900, height = 260, padLeft = 40, padBottom = 28, padTop = 12, padRight = 12;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const xFor = (idx: number, len: number) => padLeft + (len <= 1 ? 0 : (idx / (len - 1)) * plotW);
    const yFor = (ratio: number) => padTop + plotH - (ratio / maxRatio) * plotH;

    const lines = results.map((r, i) => {
      const pts = r.data.map((d, idx) => `${xFor(idx, r.data.length)},${yFor(d.ratio)}`).join(' ');
      return { title: r.title, color: LINE_COLORS[i % LINE_COLORS.length], points: pts };
    });

    // x축 라벨: 너무 많으면 일부만 표시
    const labelStep = Math.max(1, Math.ceil(periods.length / 8));
    const xLabels = periods
      .map((p, idx) => ({ p, idx }))
      .filter(({ idx }) => idx % labelStep === 0 || idx === periods.length - 1);

    return { width, height, padLeft, padBottom, padTop, lines, xLabels, xFor, periodsLen: periods.length, maxRatio };
  }, [results]);

  return (
    <div>
      <div style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <p style={{ fontSize: '12px', fontWeight: 700, color: '#8888aa', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          브랜드 선택 (최대 5개)
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {brands.map(brand => {
            const active = selected.has(brand);
            return (
              <button key={brand} onClick={() => toggleBrand(brand)}
                style={{
                  padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: active ? 700 : 400,
                  border: `1px solid ${active ? '#6c63ff' : '#2e2e3e'}`,
                  background: active ? 'rgba(108,99,255,0.15)' : '#1a1a24',
                  color: active ? '#a78bfa' : '#8888aa',
                }}>
                {brand}{brand === clientBrand ? ' (client)' : ''}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '4px' }}>시작일</p>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#e2e2f0', fontSize: '12px' }} />
          </div>
          <div>
            <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '4px' }}>종료일</p>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#e2e2f0', fontSize: '12px' }} />
          </div>
          <div>
            <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '4px' }}>단위</p>
            <select value={timeUnit} onChange={e => setTimeUnit(e.target.value as 'date' | 'week' | 'month')}
              style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#e2e2f0', fontSize: '12px' }}>
              <option value="date">일별</option>
              <option value="week">주별</option>
              <option value="month">월별</option>
            </select>
          </div>
          <button onClick={runQuery} disabled={loading}
            style={{ padding: '7px 20px', borderRadius: '6px', border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: '13px', fontWeight: 600, background: '#6c63ff', color: '#fff', opacity: loading ? 0.6 : 1 }}>
            {loading ? '조회 중...' : '조회'}
          </button>
        </div>

        {error && <p style={{ fontSize: '12px', color: '#f87171', marginTop: '12px' }}>{error}</p>}
      </div>

      {chart && (
        <div style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {chart.lines.map(l => (
              <span key={l.title} style={{ fontSize: '12px', color: '#8888aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: l.color, display: 'inline-block' }} />
                {l.title}
              </span>
            ))}
          </div>
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} style={{ width: '100%', height: '260px' }}>
            <line x1={chart.padLeft} y1={chart.padTop} x2={chart.padLeft} y2={chart.height - chart.padBottom} stroke="#2e2e3e" strokeWidth="1" />
            <line x1={chart.padLeft} y1={chart.height - chart.padBottom} x2={chart.width - 12} y2={chart.height - chart.padBottom} stroke="#2e2e3e" strokeWidth="1" />
            {chart.lines.map(l => (
              <polyline key={l.title} points={l.points} fill="none" stroke={l.color} strokeWidth="2" />
            ))}
            {chart.xLabels.map(({ p, idx }) => (
              <text key={idx} x={chart.xFor(idx, chart.periodsLen)} y={chart.height - 8} fontSize="10" fill="#8888aa" textAnchor="middle">
                {p.slice(0, 7)}
              </text>
            ))}
            <text x={chart.padLeft - 6} y={chart.padTop + 4} fontSize="10" fill="#8888aa" textAnchor="end">{Math.round(chart.maxRatio)}</text>
            <text x={chart.padLeft - 6} y={chart.height - chart.padBottom} fontSize="10" fill="#8888aa" textAnchor="end">0</text>
          </svg>
          <p style={{ fontSize: '10px', color: '#555568', marginTop: '8px' }}>
            * 절대 검색량이 아닌 상대적 검색 트렌드 지수(기간 내 최고치를 100으로 환산)입니다 - 네이버 데이터랩 제공
          </p>
        </div>
      )}
    </div>
  );
}
