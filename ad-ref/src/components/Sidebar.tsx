'use client';

export type ViewKey =
  | 'home'
  | 'news-daily' | 'news-weekly'
  | 'dash-all' | 'dash-meta' | 'dash-google' | 'dash-brand' | 'dash-monthly'
  | 'bs' | 'pwl'
  | 'trend' | 'trend-report';

interface NavLeaf { key: ViewKey; label: string; }
interface NavGroup { title: string; items: NavLeaf[]; }

const GROUPS: NavGroup[] = [
  { title: '뉴스 클리핑', items: [
    { key: 'news-daily', label: '데일리 뉴스' },
    { key: 'news-weekly', label: '주간 인사이트' },
  ] },
  { title: '경쟁사 대시보드', items: [
    { key: 'dash-all', label: '전체' },
    { key: 'dash-meta', label: '메타' },
    { key: 'dash-google', label: '구글' },
    { key: 'dash-brand', label: '브랜드별' },
    { key: 'dash-monthly', label: '월별' },
  ] },
  { title: '모니터링', items: [
    { key: 'bs', label: '브랜드검색' },
    { key: 'pwl', label: '검색광고' },
  ] },
];

const STANDALONE: NavLeaf[] = [
  { key: 'trend', label: '검색어 트렌드' },
  { key: 'trend-report', label: '트렌드 리포트' },
];

interface SidebarProps {
  active: ViewKey;
  onSelect: (key: ViewKey) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <aside style={{
      width: '220px', flexShrink: 0, background: 'rgba(15,15,19,0.95)', borderRight: '1px solid #2e2e3e',
      minHeight: '100vh', padding: '20px 14px', position: 'sticky', top: 0, alignSelf: 'flex-start',
    }}>
      <button onClick={() => onSelect('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '24px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Wisebirds</span>
        <span style={{ fontSize: '10px', color: '#8888aa', marginTop: '2px' }}>경쟁사 모니터링</span>
      </button>

      {GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', fontWeight: 700, color: '#555568', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 10px', marginBottom: '6px' }}>
            {group.title}
          </p>
          {group.items.map(item => {
            const isActive = active === item.key;
            return (
              <button key={item.key} onClick={() => onSelect(item.key)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '6px', border: 'none',
                  cursor: 'pointer', fontSize: '13px', marginBottom: '2px',
                  background: isActive ? 'rgba(108,99,255,0.18)' : 'transparent',
                  color: isActive ? '#a78bfa' : '#c4c4d4',
                  fontWeight: isActive ? 600 : 400,
                }}>
                {item.label}
              </button>
            );
          })}
        </div>
      ))}

      <div style={{ borderTop: '1px solid #2e2e3e', paddingTop: '12px', marginTop: '8px' }}>
        {STANDALONE.map(item => (
          <button key={item.key} onClick={() => onSelect(item.key)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '6px', border: 'none',
              cursor: 'pointer', fontSize: '13px', marginBottom: '2px',
              background: active === item.key ? 'rgba(108,99,255,0.18)' : 'transparent',
              color: active === item.key ? '#a78bfa' : '#c4c4d4',
              fontWeight: active === item.key ? 600 : 400,
            }}>
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
