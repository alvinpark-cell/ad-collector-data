'use client';

import ThemeToggle from './ThemeToggle';

export type ViewKey =
  | 'home'
  | 'news-daily' | 'news-weekly'
  | 'dash-all' | 'dash-meta' | 'dash-google' | 'dash-brand'
  | 'bs' | 'pwl' | 'pwl-brand'
  | 'trend' | 'trend-report' | 'community-trend';

interface NavLeaf { key: ViewKey; label: string; icon: string; }
interface NavGroup { title: string; items: NavLeaf[]; }

const GROUPS: NavGroup[] = [
  { title: '뉴스 클리핑', items: [
    { key: 'news-daily', label: '데일리 뉴스', icon: '📰' },
    { key: 'news-weekly', label: '주간 인사이트', icon: '🗞️' },
  ] },
  { title: '경쟁사 대시보드', items: [
    { key: 'dash-all', label: '전체', icon: '🗂️' },
    { key: 'dash-meta', label: '메타', icon: '📘' },
    { key: 'dash-google', label: '구글', icon: '🔎' },
    { key: 'dash-brand', label: '브랜드별', icon: '🏢' },
  ] },
  { title: '모니터링', items: [
    { key: 'bs', label: '브랜드검색', icon: '🖼️' },
    { key: 'pwl', label: '검색광고 일반키워드', icon: '🔗' },
    { key: 'pwl-brand', label: '검색광고 브랜드키워드', icon: '🏷️' },
  ] },
];

const STANDALONE: NavLeaf[] = [
  { key: 'trend', label: '검색어 트렌드', icon: '📈' },
  { key: 'trend-report', label: '트렌드 리포트', icon: '📊' },
  { key: 'community-trend', label: '커뮤니티 반응', icon: '💬' },
];

interface SidebarProps {
  active: ViewKey;
  onSelect: (key: ViewKey) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  const navBtn = (item: NavLeaf) => {
    const isActive = active === item.key;
    return (
      <button key={item.key} onClick={() => onSelect(item.key)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
          padding: '9px 12px', borderRadius: '11px', border: 'none', cursor: 'pointer',
          fontSize: '14px', marginBottom: '2px', position: 'relative',
          background: isActive ? 'var(--bg-elevated)' : 'transparent',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: isActive ? 600 : 400,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--border-subtle)'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        {isActive && (
          <span style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '3px', borderRadius: '2px', background: 'var(--accent)' }} />
        )}
        <span style={{ fontSize: '15px', opacity: isActive ? 1 : 0.75 }}>{item.icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
      </button>
    );
  };

  return (
    <aside style={{
      width: '232px', flexShrink: 0, background: 'var(--bg-surface-solid)', borderRight: '1px solid var(--border)',
      minHeight: '100vh', padding: '22px 14px', position: 'sticky', top: 0, alignSelf: 'flex-start',
    }}>
      <button onClick={() => onSelect('home')} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '22px',
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
      }}>
        <span style={{
          width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), rgba(var(--accent-rgb),0.55))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '14px', fontWeight: 800,
        }}>W</span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Wisebirds</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>경쟁사 모니터링</span>
        </span>
      </button>

      <div style={{ marginBottom: '22px' }}>
        <ThemeToggle />
      </div>

      {GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 12px', marginBottom: '6px' }}>
            {group.title}
          </p>
          {group.items.map(navBtn)}
        </div>
      ))}

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', marginTop: '6px' }}>
        {STANDALONE.map(navBtn)}
      </div>
    </aside>
  );
}
