'use client';

import { useEffect, useMemo, useState } from 'react';
import BubbleChart, { Sentiment } from './BubbleChart';
import DateCalendar from './DateCalendar';

interface CommunityReaction { source: string; text: string; }
interface CommunityKeyword { keyword: string; sentiment: Sentiment; volume: number; reactions: CommunityReaction[]; }
interface CommunityDaySnapshot { date: string; general: CommunityKeyword[]; brand: CommunityKeyword[]; }
interface CommunityTrendData { updatedAt: string; history: CommunityDaySnapshot[]; }

const SENTIMENT_LABEL: Record<Sentiment, string> = { positive: '긍정', neutral: '중립', negative: '부정' };
const SENTIMENT_COLOR: Record<Sentiment, string> = { positive: '#e6483f', neutral: 'var(--text-muted)', negative: '#3aa0e0' };

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>-</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 64, h = 22;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const trendUp = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} fill="none" stroke={trendUp ? '#e6483f' : '#3aa0e0'} strokeWidth="1.5" />
    </svg>
  );
}

interface TopicRow extends CommunityKeyword { changePct: number | null; sparkValues: number[]; }

// 특정 하루 기준 TOP10 + 전일比(하루 전 같은 키워드 대비 %) + 7일 추이(최근 최대 7일간
// 해당 키워드의 언급량, 그날 데이터에 없으면 0으로 처리)를 계산한다.
function buildTopicRowsForDay(history: CommunityDaySnapshot[], group: 'general' | 'brand', selectedDate: string): { rows: TopicRow[]; keywords: CommunityKeyword[] } {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const idx = sorted.findIndex(h => h.date === selectedDate);
  if (idx === -1) return { rows: [], keywords: [] };
  const current = sorted[idx][group];
  const prevMap = new Map((idx > 0 ? sorted[idx - 1][group] : []).map(k => [k.keyword, k.volume]));
  const windowSlice = sorted.slice(Math.max(0, idx - 6), idx + 1);

  const rows = [...current]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10)
    .map(k => {
      const prevVol = prevMap.get(k.keyword);
      const changePct = prevVol != null && prevVol > 0 ? Math.round(((k.volume - prevVol) / prevVol) * 100) : null;
      const sparkValues = windowSlice.map(day => day[group].find(x => x.keyword === k.keyword)?.volume ?? 0);
      return { ...k, changePct, sparkValues };
    });

  return { rows, keywords: current };
}

// 기간(범위) 기준 - 선택 구간 안의 모든 날짜에서 같은 키워드의 언급량을 합산하고,
// 감정 분류는 그 기간 중 언급량이 가장 컸던 날의 값을 대표로 쓴다(하루 단위 분류를
// 억지로 평균 내는 것보다 "가장 두드러졌던 날의 톤"이 더 의미 있다고 판단). 대표 반응도
// 기간 전체에서 모아 중복 제거한다. 전일比는 "하루 전 대비"라는 개념 자체가 기간에는
// 안 맞아서 계산하지 않고, 추이(스파크라인)는 최근 7일 고정 대신 선택한 기간 그대로 보여준다.
function buildTopicRowsForRange(history: CommunityDaySnapshot[], group: 'general' | 'brand', startDate: string, endDate: string): { rows: TopicRow[]; keywords: CommunityKeyword[] } {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const inRange = sorted.filter(h => h.date >= startDate && h.date <= endDate);
  if (inRange.length === 0) return { rows: [], keywords: [] };

  interface Merged { keyword: string; sentiment: Sentiment; volume: number; reactions: CommunityReaction[]; maxDailyVolume: number; }
  const merged = new Map<string, Merged>();

  inRange.forEach(day => {
    day[group].forEach(k => {
      const existing = merged.get(k.keyword);
      if (!existing) {
        merged.set(k.keyword, { keyword: k.keyword, sentiment: k.sentiment, volume: k.volume, reactions: [...(k.reactions || [])], maxDailyVolume: k.volume });
      } else {
        existing.volume += k.volume;
        existing.reactions.push(...(k.reactions || []));
        if (k.volume > existing.maxDailyVolume) { existing.maxDailyVolume = k.volume; existing.sentiment = k.sentiment; }
      }
    });
  });

  merged.forEach(m => {
    const seen = new Set<string>();
    m.reactions = m.reactions.filter(r => {
      const key = `${r.source}::${r.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  const allMerged = Array.from(merged.values()).sort((a, b) => b.volume - a.volume);
  const rows: TopicRow[] = allMerged.slice(0, 10).map(m => ({
    keyword: m.keyword, sentiment: m.sentiment, volume: m.volume, reactions: m.reactions,
    changePct: null,
    sparkValues: inRange.map(day => day[group].find(x => x.keyword === m.keyword)?.volume ?? 0),
  }));
  const keywords: CommunityKeyword[] = allMerged.map(m => ({ keyword: m.keyword, sentiment: m.sentiment, volume: m.volume, reactions: m.reactions }));

  return { rows, keywords };
}

function TopicSection({ title, subtitle, rows, keywords, periodLabel, sparkDayCount }: {
  title: string; subtitle?: string; rows: TopicRow[]; keywords: CommunityKeyword[]; periodLabel: string; sparkDayCount: number;
}) {
  // 대표 반응: 언급량 상위 키워드부터 하나씩, 출처가 겹치지 않게 최대 3개
  const representative: { keyword: string; source: string; text: string }[] = [];
  const seenSources = new Set<string>();
  for (const row of rows) {
    if (representative.length >= 3) break;
    const r = row.reactions?.find(x => !seenSources.has(x.source));
    if (r) { representative.push({ keyword: row.keyword, source: r.source, text: r.text }); seenSources.add(r.source); }
  }

  return (
    <section style={{ marginBottom: '36px' }}>
      <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: subtitle ? '2px' : '10px' }}>{title}</p>
      {subtitle && <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '10px' }}>{subtitle}</p>}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
        <BubbleChart data={keywords.map(k => ({ keyword: k.keyword, count: k.volume, sentiment: k.sentiment }))} />
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '14px', overflowX: 'auto' }}>
        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>
          상위 화제 키워드 TOP 10 · {periodLabel}
        </p>
        {rows.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', padding: '10px 0' }}>데이터 없음</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '480px' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>순위</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>키워드</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>분류</th>
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>언급량</th>
                {sparkDayCount > 1 && rows.some(r => r.changePct !== null) && <th style={{ padding: '6px 8px', fontWeight: 500 }}>전일比</th>}
                <th style={{ padding: '6px 8px', fontWeight: 500 }}>추이</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.keyword} style={{ borderBottom: '1px solid var(--bg-elevated)' }}>
                  <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.keyword}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontSize: '13px', color: SENTIMENT_COLOR[r.sentiment] }}>{SENTIMENT_LABEL[r.sentiment]}</span>
                  </td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{r.volume.toLocaleString()}</td>
                  {sparkDayCount > 1 && rows.some(x => x.changePct !== null) && (
                    <td style={{ padding: '7px 8px', color: r.changePct == null ? 'var(--text-faint)' : r.changePct >= 0 ? '#e6483f' : '#3aa0e0' }}>
                      {r.changePct == null ? (rows.some(x => x.changePct !== null) ? 'NEW' : '-') : `${r.changePct >= 0 ? '+' : ''}${r.changePct}%`}
                    </td>
                  )}
                  <td style={{ padding: '7px 8px' }}><Sparkline values={r.sparkValues} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {representative.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>💬 실제 확인된 대표 반응</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {representative.map((r, i) => (
              <div key={i} style={{ paddingBottom: i < representative.length - 1 ? '10px' : 0, borderBottom: i < representative.length - 1 ? '1px solid var(--bg-elevated)' : 'none' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-text)', marginBottom: '4px' }}>{r.source}</p>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type DateMode = 'day' | 'range';

export default function CommunityTrend() {
  const [data, setData] = useState<CommunityTrendData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [mode, setMode] = useState<DateMode>('day');
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');

  useEffect(() => {
    fetch('/data/community_trend.json')
      .then(r => r.json())
      .then((json: CommunityTrendData) => {
        setData(json);
        const dates = (json.history || []).map(h => h.date).sort();
        if (dates.length > 0) {
          setSelectedDate(dates[dates.length - 1]);
          setRangeStart(dates[Math.max(0, dates.length - 7)]);
          setRangeEnd(dates[dates.length - 1]);
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : '조회 실패'));
  }, []);

  if (error) return <p style={{ fontSize: '15px', color: 'var(--danger)' }}>커뮤니티 반응 데이터를 불러오지 못했습니다: {error}</p>;
  if (!data || !selectedDate) return <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>불러오는 중...</p>;

  const availableDates = data.history.map(h => h.date);
  const modeBtn = (active: boolean) => ({
    padding: '6px 14px', borderRadius: '20px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'var(--bg-surface-solid)', color: active ? '#fff' : 'var(--text-muted)',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  });

  const general = mode === 'day' ? buildTopicRowsForDay(data.history, 'general', selectedDate) : buildTopicRowsForRange(data.history, 'general', rangeStart, rangeEnd);
  const brand = mode === 'day' ? buildTopicRowsForDay(data.history, 'brand', selectedDate) : buildTopicRowsForRange(data.history, 'brand', rangeStart, rangeEnd);
  const periodLabel = mode === 'day' ? `${selectedDate} 기준` : `${rangeStart} ~ ${rangeEnd} 합산`;
  const sparkDayCount = mode === 'day' ? Math.min(7, availableDates.filter(d => d <= selectedDate).length) : (rangeStart && rangeEnd ? availableDates.filter(d => d >= rangeStart && d <= rangeEnd).length : 0);

  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>커뮤니티 반응</h2>
      <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '20px' }}>
        최근 갱신: {new Date(data.updatedAt).toLocaleString('ko-KR')}
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => setMode('day')} style={modeBtn(mode === 'day')}>특정 날짜</button>
        <button onClick={() => setMode('range')} style={modeBtn(mode === 'range')}>기간</button>
      </div>

      {mode === 'day' ? (
        <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <DateCalendar availableDates={availableDates} selected={selectedDate} onSelect={setSelectedDate} />
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', flex: 1, minWidth: '220px', paddingTop: '4px' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>{selectedDate}</strong> 기준 데이터입니다. 과거 이력은 이 기능을 도입한 날부터 쌓이므로,
            전일比·추이 그래프는 데이터가 쌓일수록 점점 정확해집니다.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '24px' }}>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>시작일</p>
            <input type="date" value={rangeStart} min={availableDates[0]} max={rangeEnd || availableDates[availableDates.length - 1]}
              onChange={e => setRangeStart(e.target.value)}
              style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '14px' }} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>종료일</p>
            <input type="date" value={rangeEnd} min={rangeStart || availableDates[0]} max={availableDates[availableDates.length - 1]}
              onChange={e => setRangeEnd(e.target.value)}
              style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '14px' }} />
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', paddingBottom: '6px' }}>
            선택한 기간 동안의 언급량을 합산해서 보여줍니다 (전일比는 기간 모드에서는 계산하지 않습니다).
          </p>
        </div>
      )}

      <TopicSection title="주식/투자 전반 화제 키워드" subtitle="디시인사이드 주식 갤러리 + 웹서치 기반. 메리츠증권 한정이 아닌 시장 전체 화제."
        rows={general.rows} keywords={general.keywords} periodLabel={periodLabel} sparkDayCount={sparkDayCount} />
      <TopicSection title="메리츠증권 화제 키워드"
        rows={brand.rows} keywords={brand.keywords} periodLabel={periodLabel} sparkDayCount={sparkDayCount} />
    </div>
  );
}
