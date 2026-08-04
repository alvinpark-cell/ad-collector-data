'use client';

import { useState, useEffect, useMemo } from 'react';
import { PowerlinkItem } from '@/lib/types';
import { getMonthWeekKey, sortMonthWeekKeysDesc } from '@/lib/weekUtils';
import WeekSelector from './WeekSelector';

interface PowerlinkInsightEntry {
  type: 'first' | 'change' | 'no-change';
  weekKey: string;
  prevWeekKey?: string;
  newCount?: number;
  exitedCount?: number;
  text: string;
  updatedAt: string;
}

export default function PowerlinkMonitor() {
  const [data, setData] = useState<PowerlinkItem[]>([]);
  const [insights, setInsights] = useState<Record<string, PowerlinkInsightEntry>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/powerlink_index.json').then(r => r.json()).then((d: PowerlinkItem[]) => {
      setData(d);
      setLoading(false);
      const weeks = sortMonthWeekKeysDesc(d.map(i => getMonthWeekKey(i.collectedAt)));
      if (weeks.length > 0) setSelectedWeek(weeks[0]);
    }).catch(() => setLoading(false));
    fetch('/data/powerlink_insight.json').then(r => r.json()).then(setInsights).catch(() => setInsights({}));
  }, []);

  const toggle = (key: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const weekKeys = useMemo(() => sortMonthWeekKeysDesc(data.map(i => getMonthWeekKey(i.collectedAt))), [data]);

  const weekData = useMemo(() => {
    if (!selectedWeek) return data;
    return data.filter(i => getMonthWeekKey(i.collectedAt) === selectedWeek);
  }, [data, selectedWeek]);

  const keywords = useMemo(() => Array.from(new Set(weekData.map(d => d.keyword))), [weekData]);

  if (loading) return <div style={{ color: '#8888aa', fontSize: '13px' }}>로딩 중...</div>;

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#8888aa' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔗</div>
        <p>수집된 파워링크 데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <div>
      <WeekSelector weekKeys={weekKeys} selected={selectedWeek} onSelect={setSelectedWeek} />

      {Object.keys(insights).length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {keywords.map(keyword => {
            const insight = insights[keyword];
            if (!insight || insight.weekKey !== selectedWeek) return null;
            return (
              <div key={keyword} style={{ background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.25)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa' }}>🔎 &quot;{keyword}&quot; 인사이트</span>
                  {insight.type === 'change' && (
                    <span style={{ fontSize: '10px', color: '#8888aa' }}>신규 {insight.newCount}건 · 이탈 {insight.exitedCount}건 ({insight.prevWeekKey} → {insight.weekKey})</span>
                  )}
                  {insight.type === 'first' && <span style={{ fontSize: '10px', color: '#6b7280' }}>최초 수집 요약</span>}
                </div>
                <p style={{ fontSize: '12px', color: '#e2e2f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{insight.text}</p>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {keywords.map(keyword => {
          const items = weekData.filter(d => d.keyword === keyword);
          const pc = items.filter(i => i.device === 'pc').sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0];
          const mo = items.filter(i => i.device === 'mo').sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0];
          const isOpen = expanded.has(keyword);

          return (
            <div key={keyword} style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', overflow: 'hidden' }}>
              <button onClick={() => toggle(keyword)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: '#e2e2f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600 }}>{keyword}</span>
                  <span style={{ fontSize: '11px', color: '#8888aa' }}>PC {pc ? `✓ (${pc.ads.length}개)` : '✗'} · MO {mo ? `✓ (${mo.ads.length}개)` : '✗'}</span>
                  {pc && <span style={{ fontSize: '10px', color: '#555568' }}>수집일 {new Date(pc.collectedAt).toLocaleDateString('ko-KR')}</span>}
                </div>
                <span style={{ color: '#8888aa', fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid #2e2e3e', padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {[{ item: pc, label: 'PC' }, { item: mo, label: 'MO' }].map(({ item, label }) => (
                      <div key={label}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ background: '#03c75a', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{label}</span>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>네이버 파워링크</span>
                          {item && <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#8888aa' }}>{new Date(item.collectedAt).toLocaleDateString('ko-KR')}</span>}
                        </div>
                        {!item ? (
                          <div style={{ color: '#8888aa', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>수집된 데이터 없음</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {item.ads.map(ad => (
                              <div key={ad.rank} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#22222f', border: '1px solid #2e2e3e', borderRadius: '8px', padding: '10px' }}>
                                <span style={{ background: '#6c63ff', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{ad.rank}</span>
                                {ad.localImage && (
                                  <img src={'/data/' + ad.localImage} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, cursor: 'pointer' }}
                                    onClick={() => window.open('/data/' + ad.localImage, '_blank')} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{ad.advertiserName || '(광고주명 없음)'}</span>
                                    {ad.displayUrl && <span style={{ fontSize: '10px', color: '#8888aa' }}>{ad.displayUrl}</span>}
                                    {ad.adPeriod && <span style={{ fontSize: '9px', color: '#555568', marginLeft: 'auto' }}>집행 {ad.adPeriod}</span>}
                                  </div>
                                  <p style={{ fontSize: '11px', color: '#e2e2f0', margin: '3px 0 0' }}>{ad.title}</p>
                                  {ad.description && <p style={{ fontSize: '10px', color: '#8888aa', margin: '2px 0 0' }}>{ad.description}</p>}
                                  {ad.landingUrl && (
                                    <a href={ad.landingUrl} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: '9px', color: '#a78bfa', textDecoration: 'none', display: 'inline-block', marginTop: '3px' }}>
                                      {ad.landingUrl.slice(0, 40)} ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
