'use client';

import { useState, useEffect, useMemo } from 'react';
import { sortMonthWeekKeysDesc } from '@/lib/weekUtils';
import WeekSelector from './WeekSelector';
import InsightBox from './InsightBox';

interface PwlSublink { title: string; url: string; imageUrl?: string; }
interface PwlExtraTitle { badge: string; text: string; url: string; }
interface PwlAd {
  rank: number; advertiserName: string | null; displayUrl: string | null;
  title: string; description: string | null; adPeriod: string | null;
  landingUrl: string | null; imageUrl: string | null; localImage?: string;
  sublinks?: PwlSublink[]; imageSublinks?: PwlSublink[]; extraTitle?: PwlExtraTitle | null;
}
interface PwlBrandEntry {
  brand: string; device: 'pc' | 'mo'; weekKey: string;
  status: 'collected' | 'no-ads'; ads: PwlAd[]; refreshCount: number; collectedAt: string;
}
interface PwlBrandInsightEntry {
  type: 'first' | 'change' | 'no-change' | 'no-ads';
  weekKey: string; prevWeekKey?: string; newCount?: number; exitedCount?: number;
  text: string; updatedAt: string;
}

export default function PowerlinkBrandMonitor() {
  const [data, setData] = useState<PwlBrandEntry[]>([]);
  const [insights, setInsights] = useState<Record<string, PwlBrandInsightEntry>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/powerlink_brand_index.json').then(r => r.json()).then((d: PwlBrandEntry[]) => {
      setData(d);
      setLoading(false);
      const weeks = sortMonthWeekKeysDesc(d.map(i => i.weekKey));
      if (weeks.length > 0) setSelectedWeek(weeks[0]);
    }).catch(() => setLoading(false));
    fetch('/data/powerlink_brand_insight.json').then(r => r.json()).then(setInsights).catch(() => setInsights({}));
  }, []);

  const toggle = (key: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const weekKeys = useMemo(() => sortMonthWeekKeysDesc(data.map(i => i.weekKey)), [data]);
  const weekData = useMemo(() => selectedWeek ? data.filter(i => i.weekKey === selectedWeek) : data, [data, selectedWeek]);
  const brands = useMemo(() => Array.from(new Set(weekData.map(d => d.brand))), [weekData]);

  if (loading) return <div style={{ color: '#8888aa', fontSize: '13px' }}>로딩 중...</div>;

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#8888aa' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔗</div>
        <p>수집된 검색광고 브랜드키워드 데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '14px' }}>
        경쟁사 9개 브랜드명을 각각 키워드로 검색해서, 한 번 수집할 때 페이지를 여러 번 새로고침하며 노출되는 소재(제목/설명/서브링크/추가제목)를 모읍니다.
      </p>
      <WeekSelector weekKeys={weekKeys} selected={selectedWeek} onSelect={setSelectedWeek} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
        {brands.map(brand => {
          const entries = weekData.filter(d => d.brand === brand);
          const pc = entries.find(e => e.device === 'pc');
          const mo = entries.find(e => e.device === 'mo');
          const noAds = entries.length > 0 && entries.every(e => e.status === 'no-ads');
          const isOpen = expanded.has(brand);
          const insight = insights[brand];

          return (
            <div key={brand} style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', overflow: 'hidden' }}>
              <button onClick={() => toggle(brand)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: '#e2e2f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600 }}>{brand}</span>
                  {noAds ? (
                    <span style={{ fontSize: '11px', color: '#8888aa', background: 'rgba(136,136,170,0.1)', padding: '2px 8px', borderRadius: '4px' }}>광고 미집행 중</span>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#8888aa' }}>
                      PC {pc && pc.ads.length > 0 ? `✓ (${pc.ads.length}개 소재)` : '✗'} · MO {mo && mo.ads.length > 0 ? `✓ (${mo.ads.length}개 소재)` : '✗'}
                    </span>
                  )}
                </div>
                <span style={{ color: '#8888aa', fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid #2e2e3e', padding: '20px' }}>
                  {insight && (
                    <InsightBox
                      title="🔎 소구점/순위 인사이트"
                      badge={insight.type === 'change' ? `신규 ${insight.newCount}건 · 이탈 ${insight.exitedCount}건 (${insight.prevWeekKey} → ${insight.weekKey})` : undefined}
                      text={insight.text}
                    />
                  )}
                  {noAds ? (
                    <div style={{ color: '#8888aa', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>
                      이번 주 "{brand}" 키워드로는 파워링크 광고가 노출되지 않았습니다.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      {[{ item: pc, label: 'PC' }, { item: mo, label: 'MO' }].map(({ item, label }) => (
                        <div key={label}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ background: '#03c75a', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{label}</span>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>네이버 파워링크</span>
                            {item && <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#8888aa' }}>새로고침 {item.refreshCount}회 · {new Date(item.collectedAt).toLocaleDateString('ko-KR')}</span>}
                          </div>
                          {!item || item.ads.length === 0 ? (
                            <div style={{ color: '#8888aa', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>수집된 데이터 없음</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {item.ads.map((ad, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#22222f', border: '1px solid #2e2e3e', borderRadius: '8px', padding: '10px' }}>
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
                                    {ad.extraTitle && ad.extraTitle.text && (
                                      <p style={{ fontSize: '10px', color: '#fb923c', margin: '3px 0 0' }}>
                                        {ad.extraTitle.badge && <span style={{ fontWeight: 700 }}>[{ad.extraTitle.badge}] </span>}
                                        {ad.extraTitle.text}
                                      </p>
                                    )}
                                    {ad.sublinks && ad.sublinks.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                        {ad.sublinks.map((s, si) => (
                                          <span key={si} style={{ fontSize: '9px', color: '#a78bfa', background: 'rgba(108,99,255,0.1)', padding: '1px 6px', borderRadius: '3px' }}>{s.title}</span>
                                        ))}
                                      </div>
                                    )}
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
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
