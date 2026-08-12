'use client';

import { useState, useEffect, useMemo } from 'react';
import { PowerlinkItem } from '@/lib/types';
import { getMonthWeekKey, sortMonthWeekKeysDesc } from '@/lib/weekUtils';
import WeekSelector from './WeekSelector';
import InsightBox from './InsightBox';
import { mediaUrl } from '@/lib/utils';

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
  // 키워드 -> 주차 -> 인사이트 (2026-08-11부터 - 예전엔 키워드당 최신 주차 하나만 있어서
  // 지난 주차를 선택하면 인사이트가 안 보였음)
  const [insights, setInsights] = useState<Record<string, Record<string, PowerlinkInsightEntry>>>({});
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

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '15px' }}>로딩 중...</div>;

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔗</div>
        <p>수집된 파워링크 데이터가 없습니다</p>
      </div>
    );
  }

  const totalAdsThisWeek = keywords.reduce((sum, kw) => {
    const items = weekData.filter(d => d.keyword === kw);
    return sum + items.reduce((s, i) => s + i.ads.length, 0);
  }, 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: '수집 키워드', value: keywords.length, color: 'var(--accent-text)' },
          { label: '이번 주 소재 (PC+MO 합계)', value: totalAdsThisWeek, color: 'var(--success)' },
          { label: '인사이트 생성', value: Object.keys(insights).length, color: '#3aa0e0' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
            <p style={{ fontSize: '30px', fontWeight: 700, color, marginTop: '8px', letterSpacing: '-0.5px' }}>{value}</p>
          </div>
        ))}
      </div>

      <WeekSelector weekKeys={weekKeys} selected={selectedWeek} onSelect={setSelectedWeek} />

      {Object.keys(insights).length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {keywords.map(keyword => {
            const insight = selectedWeek ? insights[keyword]?.[selectedWeek] : undefined;
            if (!insight) return null;
            const badge = insight.type === 'change'
              ? `신규 ${insight.newCount}건 · 이탈 ${insight.exitedCount}건 (${insight.prevWeekKey} → ${insight.weekKey})`
              : insight.type === 'first' ? '최초 수집 요약' : undefined;
            return (
              <InsightBox key={keyword} title={`🔎 "${keyword}" 인사이트`} badge={badge} text={insight.text} />
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
            <div key={keyword} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <button onClick={() => toggle(keyword)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600 }}>{keyword}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>PC {pc ? `✓ (${pc.ads.length}개)` : '✗'} · MO {mo ? `✓ (${mo.ads.length}개)` : '✗'}</span>
                  {pc && <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>수집일 {new Date(pc.collectedAt).toLocaleDateString('ko-KR')}</span>}
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {[{ item: pc, label: 'PC' }, { item: mo, label: 'MO' }].map(({ item, label }) => (
                      <div key={label}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ background: '#03c75a', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{label}</span>
                          <span style={{ fontSize: '14px', fontWeight: 600 }}>네이버 파워링크</span>
                          {item && <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(item.collectedAt).toLocaleDateString('ko-KR')}</span>}
                        </div>
                        {!item ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '20px 0', textAlign: 'center' }}>수집된 데이터 없음</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {item.ads.map(ad => (
                              <div key={ad.rank} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                                <span style={{ background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>{ad.rank}</span>
                                {ad.localImage && (
                                  <img src={mediaUrl(ad.localImage)} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, cursor: 'pointer' }}
                                    onClick={() => window.open(mediaUrl(ad.localImage), '_blank')} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{ad.advertiserName || '(광고주명 없음)'}</span>
                                    {ad.displayUrl && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{ad.displayUrl}</span>}
                                    {ad.adPeriod && <span style={{ fontSize: '11px', color: 'var(--text-faint)', marginLeft: 'auto' }}>집행 {ad.adPeriod}</span>}
                                  </div>
                                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '3px 0 0' }}>{ad.title}</p>
                                  {ad.description && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{ad.description}</p>}
                                  {ad.extraTitle && ad.extraTitle.text && (
                                    <p style={{ fontSize: '12px', color: '#fb923c', margin: '3px 0 0' }}>
                                      {ad.extraTitle.badge && <span style={{ fontWeight: 700 }}>[{ad.extraTitle.badge}] </span>}
                                      {ad.extraTitle.text}
                                    </p>
                                  )}
                                  {((ad.sublinks && ad.sublinks.length > 0) || (ad.imageSublinks && ad.imageSublinks.length > 0)) && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                      {(ad.sublinks || []).map((s, si) => (
                                        <span key={`s${si}`} style={{ fontSize: '11px', color: 'var(--accent-text)', background: 'var(--accent-soft)', padding: '1px 6px', borderRadius: '3px' }}>{s.title}</span>
                                      ))}
                                      {(ad.imageSublinks || []).map((s, si) => (
                                        <span key={`i${si}`} style={{ fontSize: '11px', color: 'var(--success)', background: 'rgba(52,211,153,0.1)', padding: '1px 6px', borderRadius: '3px' }}>🖼️ {s.title}</span>
                                      ))}
                                    </div>
                                  )}
                                  {ad.landingUrl && (
                                    <a href={ad.landingUrl} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: '11px', color: 'var(--accent-text)', textDecoration: 'none', display: 'inline-block', marginTop: '3px' }}>
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
