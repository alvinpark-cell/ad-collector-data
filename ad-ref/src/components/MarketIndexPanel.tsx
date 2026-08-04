'use client';

import { useEffect, useMemo, useState } from 'react';

interface DailyPoint { date: string; close: number; }
interface RawIndexResult { key: string; symbol: string; data: DailyPoint[]; }
type IndexMap = Record<string, RawIndexResult>;

interface FilteredIndex { key: string; data: DailyPoint[]; changePct: number | null; }

interface MarketIndexPanelProps {
  startDate: string;
  endDate: string;
  timeUnit: 'date' | 'week' | 'month';
}

const LABELS: Record<string, string> = { kospi: '코스피', kosdaq: '코스닥', nasdaq: '나스닥' };
const COLORS: Record<string, string> = { kospi: '#6c63ff', kosdaq: '#03c75a', nasdaq: '#e0a030' };

function fmtNum(n: number) {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

// 1년치를 캐싱해두고 매번 [startDate, endDate] 구간만 잘라서 씀 - 데이터랩 조회 기간이
// 1개월이든 1년이든 이 필터링만으로 그대로 대응 가능 (정적 export라 그때그때 새로 못 받아옴)
function filterToRange(idx: RawIndexResult, startDate: string, endDate: string): FilteredIndex {
  const data = idx.data.filter(d => d.date >= startDate && d.date <= endDate);
  const changePct = data.length >= 2
    ? ((data[data.length - 1].close - data[0].close) / data[0].close) * 100
    : null;
  return { key: idx.key, data, changePct };
}

// 코스피(2000~3000대)와 코스닥(700~900대)은 절대 수치 스케일이 달라서 그대로 겹쳐 그리면
// 코스닥이 거의 안 보임 - 첫날 대비 등락률(%)로 정규화해서 한 차트에서 비교 가능하게 함
function buildChart(indices: FilteredIndex[]) {
  const withData = indices.filter(i => i.data.length > 0);
  if (withData.length === 0) return null;

  const series = withData.map(idx => {
    const base = idx.data[0].close;
    const pct = idx.data.map(d => ((d.close - base) / base) * 100);
    return { key: idx.key, pct };
  });

  const allPct = series.flatMap(s => s.pct);
  const minPct = Math.min(...allPct, 0);
  const maxPct = Math.max(...allPct, 0);
  const range = Math.max(maxPct - minPct, 0.1);

  const width = 420, height = 180, padLeft = 40, padBottom = 20, padTop = 10, padRight = 10;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const len = withData[0].data.length;

  const xFor = (i: number) => padLeft + (len <= 1 ? 0 : (i / (len - 1)) * plotW);
  const yFor = (pct: number) => padTop + plotH - ((pct - minPct) / range) * plotH;
  const zeroY = yFor(0);

  const lines = series.map(s => ({
    key: s.key,
    color: COLORS[s.key],
    points: s.pct.map((p, i) => `${xFor(i)},${yFor(p)}`).join(' '),
  }));

  return { width, height, padLeft, padTop, plotH, lines, xFor, zeroY, maxPct, minPct };
}

function IndexCard({ title, indices }: { title: string; indices: FilteredIndex[] }) {
  const chart = buildChart(indices);
  // 하단 표는 선택 구간이 1개월이든 1년이든 항상 "마지막 날짜 기준 최근 7거래일"만 보여준다
  const last7 = indices.map(idx => ({ ...idx, data: idx.data.slice(-7) }));

  return (
    <div style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '18px', flex: 1, minWidth: '320px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#e2e2f0' }}>{title}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          {indices.map(idx => (
            <span key={idx.key} style={{ fontSize: '11px', color: '#8888aa', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS[idx.key], display: 'inline-block' }} />
              {LABELS[idx.key]}
              {idx.changePct !== null && (
                <span style={{ color: idx.changePct >= 0 ? '#f87171' : '#3aa0e0', fontWeight: 600 }}>
                  {idx.changePct >= 0 ? '+' : ''}{idx.changePct.toFixed(2)}%
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {chart ? (
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} style={{ width: '100%', height: '160px' }}>
          <line x1={chart.padLeft} y1={chart.zeroY} x2={chart.width - 10} y2={chart.zeroY} stroke="#2e2e3e" strokeWidth="1" strokeDasharray="3,3" />
          {chart.lines.map(l => (
            <polyline key={l.key} points={l.points} fill="none" stroke={l.color} strokeWidth="2" />
          ))}
          <text x={chart.padLeft - 6} y={chart.padTop + 4} fontSize="9" fill="#8888aa" textAnchor="end">{chart.maxPct.toFixed(1)}%</text>
          <text x={chart.padLeft - 6} y={chart.zeroY + 3} fontSize="9" fill="#8888aa" textAnchor="end">0%</text>
          <text x={chart.padLeft - 6} y={chart.padTop + chart.plotH} fontSize="9" fill="#8888aa" textAnchor="end">{chart.minPct.toFixed(1)}%</text>
        </svg>
      ) : (
        <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555568', fontSize: '12px' }}>선택한 기간에 데이터 없음</div>
      )}

      <p style={{ fontSize: '9px', color: '#555568', margin: '8px 0 4px' }}>최근 7거래일</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ color: '#8888aa', textAlign: 'right' }}>
              <th style={{ textAlign: 'left', paddingBottom: '4px' }}>날짜</th>
              {last7.map(idx => <th key={idx.key} style={{ paddingBottom: '4px' }}>{LABELS[idx.key]}</th>)}
            </tr>
          </thead>
          <tbody>
            {(last7[0]?.data || []).map((d, i) => (
              <tr key={d.date} style={{ borderTop: '1px solid #22222f' }}>
                <td style={{ padding: '3px 0', color: '#8888aa' }}>{d.date.slice(5)}</td>
                {last7.map(idx => {
                  const point = idx.data[i];
                  const prev = idx.data[i - 1];
                  const dayChange = point && prev ? ((point.close - prev.close) / prev.close) * 100 : null;
                  return (
                    <td key={idx.key} style={{ padding: '3px 0', textAlign: 'right', color: '#e2e2f0' }}>
                      {point ? fmtNum(point.close) : '-'}
                      {dayChange !== null && (
                        <span style={{ color: dayChange >= 0 ? '#f87171' : '#3aa0e0', marginLeft: '4px' }}>
                          ({dayChange >= 0 ? '+' : ''}{dayChange.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MarketIndexPanel({ startDate, endDate, timeUnit }: MarketIndexPanelProps) {
  const [data, setData] = useState<IndexMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/market_index.json')
      .then(r => r.json())
      .then(json => {
        if (!json.kospi && !json.kosdaq && !json.nasdaq) { setError('아직 수집된 지수 데이터가 없습니다'); return; }
        setData(json);
      })
      .catch(e => setError(e instanceof Error ? e.message : '조회 실패'));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return null;
    return {
      kospi: data.kospi ? filterToRange(data.kospi, startDate, endDate) : null,
      kosdaq: data.kosdaq ? filterToRange(data.kosdaq, startDate, endDate) : null,
      nasdaq: data.nasdaq ? filterToRange(data.nasdaq, startDate, endDate) : null,
    };
  }, [data, startDate, endDate]);

  if (error) {
    return <p style={{ fontSize: '12px', color: '#f87171', marginBottom: '20px' }}>지수 데이터를 불러오지 못했습니다: {error}</p>;
  }
  if (!filtered) {
    return <p style={{ fontSize: '12px', color: '#8888aa', marginBottom: '20px' }}>시장 지수 불러오는 중...</p>;
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <p style={{ fontSize: '10px', color: '#555568', marginBottom: '8px' }}>
        검색어 트렌드와 동일한 조회 기간({startDate} ~ {endDate}, {timeUnit === 'date' ? '일별' : timeUnit === 'week' ? '주별' : '월별'} 기준)
      </p>
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <IndexCard title="코스피 · 코스닥" indices={[filtered.kospi, filtered.kosdaq].filter((v): v is FilteredIndex => !!v)} />
        <IndexCard title="나스닥" indices={[filtered.nasdaq].filter((v): v is FilteredIndex => !!v)} />
      </div>
    </div>
  );
}
