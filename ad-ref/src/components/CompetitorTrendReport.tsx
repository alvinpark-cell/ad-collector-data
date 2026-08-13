'use client';

import { useEffect, useMemo, useState } from 'react';
import { mediaUrl } from '@/lib/utils';

interface Finding {
  brand: string;
  media: string;
  detail: string;
  date: string;
  url?: string;
  imageUrl?: string;
}
interface ReportBatch {
  reportDate: string;
  source: string;
  sourceType: string;
  note?: string;
  findings: Finding[];
}

const MEDIA_ORDER = ['타임보드', '스페셜DA', '유튜브', 'ATL'];
const MEDIA_ICON: Record<string, string> = {
  '타임보드': '📺', '스페셜DA': '📱', '유튜브': '🎥', 'ATL': '📼',
};
const MEDIA_COLOR: Record<string, { bg: string; text: string }> = {
  '타임보드': { bg: 'rgba(3,199,90,0.15)', text: '#03c75a' },
  '스페셜DA': { bg: 'rgba(58,160,224,0.15)', text: '#3aa0e0' },
  '유튜브': { bg: 'rgba(248,113,113,0.15)', text: '#f87171' },
  'ATL': { bg: 'rgba(148,163,184,0.15)', text: 'var(--text-muted)' },
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: '14px',
};

export default function CompetitorTrendReport() {
  const [batches, setBatches] = useState<ReportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selYearMonth, setSelYearMonth] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/data/competitor_trend_report.json')
      .then(r => r.json())
      .then((json: ReportBatch[]) => setBatches(Array.isArray(json) ? json : []))
      .catch(() => setBatches([]))
      .finally(() => setLoading(false));
  }, []);

  const allFindings = useMemo(
    () => batches.flatMap(b => b.findings.map(f => ({ ...f, reportDate: b.reportDate, source: b.source }))),
    [batches]
  );

  const yearMonths = useMemo(() => {
    const set = new Set(allFindings.map(f => f.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [allFindings]);

  const effectiveYearMonth = yearMonths.includes(selYearMonth || '') ? (selYearMonth as string) : (yearMonths[0] || null);

  const monthFindings = useMemo(
    () => effectiveYearMonth ? allFindings.filter(f => f.date.slice(0, 7) === effectiveYearMonth) : [],
    [allFindings, effectiveYearMonth]
  );

  const byMedia = useMemo(() => {
    const map: Record<string, typeof monthFindings> = {};
    monthFindings.forEach(f => {
      if (!map[f.media]) map[f.media] = [];
      map[f.media].push(f);
    });
    Object.values(map).forEach(list => list.sort((a, b) => b.date.localeCompare(a.date)));
    return map;
  }, [monthFindings]);

  const mediaKeys = useMemo(() => {
    const known = MEDIA_ORDER.filter(m => byMedia[m]);
    const extra = Object.keys(byMedia).filter(m => !MEDIA_ORDER.includes(m));
    return [...known, ...extra];
  }, [byMedia]);

  const toggle = (key: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const ymLabel = (ym: string) => {
    const [y, m] = ym.split('-');
    return `${y}년 ${Number(m)}월`;
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '15px' }}>로딩 중...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>경쟁사 동향 보고</h2>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
        매월 25일 주간, 경쟁사(키움/미래에셋/삼성/나무/KB/한국투자/신한투자/토스/대신/한화투자)의 네이버 타임보드·스페셜DA,
        유튜브 채널 소재, ATL(tvcf.co.kr) 현황을 정리합니다.
      </p>

      {yearMonths.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
          <p>등록된 경쟁사 동향 리포트가 없습니다</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <select
              value={effectiveYearMonth || ''}
              onChange={e => setSelYearMonth(e.target.value)}
              style={{
                background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '8px',
                padding: '8px 12px', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {yearMonths.map(ym => <option key={ym} value={ym}>{ymLabel(ym)}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {mediaKeys.map(media => {
              const items = byMedia[media] || [];
              const isOpen = expanded.has(media);
              const color = MEDIA_COLOR[media] || { bg: 'rgba(148,163,184,0.15)', text: 'var(--text-muted)' };
              return (
                <div key={media} style={{ ...cardStyle, overflow: 'hidden' }}>
                  <button onClick={() => toggle(media)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '16px' }}>{MEDIA_ICON[media] || '📌'}</span>
                      <span style={{ fontSize: '15px', fontWeight: 600 }}>{media}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: color.bg, color: color.text }}>
                        {items.length}건
                      </span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {items.map((f, fi) => (
                        <div key={fi} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px',
                        }}>
                          {f.imageUrl && (
                            <img src={mediaUrl(f.imageUrl)} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, cursor: 'pointer' }}
                              onClick={() => window.open(mediaUrl(f.imageUrl), '_blank')} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{f.brand}</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{f.date}</span>
                            </div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '3px 0 0' }}>{f.detail}</p>
                            {f.url && (
                              <a href={f.url} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: '12px', color: 'var(--accent-text)', textDecoration: 'none', display: 'inline-block', marginTop: '3px' }}>
                                링크 보기 ↗
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
