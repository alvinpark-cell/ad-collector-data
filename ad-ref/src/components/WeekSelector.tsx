'use client';

import { formatMonthWeekLabel } from '@/lib/weekUtils';

interface WeekSelectorProps {
  weekKeys: string[]; // 최신순 정렬된 월/주차 키 목록
  selected: string | null;
  onSelect: (key: string) => void;
}

export default function WeekSelector({ weekKeys, selected, onSelect }: WeekSelectorProps) {
  if (weekKeys.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 14px', background: 'rgba(26,26,36,0.6)', border: '1px solid #2e2e3e', borderRadius: '10px' }}>
      <span style={{ fontSize: '11px', color: '#8888aa', fontWeight: 700, marginRight: '4px' }}>수집 주차</span>
      {weekKeys.map(key => {
        const active = key === selected;
        return (
          <button key={key} onClick={() => onSelect(key)}
            style={{
              padding: '5px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: active ? 700 : 400,
              border: `1px solid ${active ? '#6c63ff' : '#2e2e3e'}`,
              background: active ? 'rgba(108,99,255,0.15)' : 'transparent',
              color: active ? '#a78bfa' : '#8888aa',
              whiteSpace: 'nowrap',
            }}>
            {formatMonthWeekLabel(key)}
          </button>
        );
      })}
    </div>
  );
}
