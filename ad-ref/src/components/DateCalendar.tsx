'use client';

import { useMemo, useState } from 'react';

interface DateCalendarProps {
  availableDates: string[]; // "YYYY-MM-DD" 목록
  selected: string;
  onSelect: (date: string) => void;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function DateCalendar({ availableDates, selected, onSelect }: DateCalendarProps) {
  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);
  const initialYm = selected.slice(0, 7);
  const [ym, setYm] = useState(initialYm);

  const [yearStr, monthStr] = ym.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1~12

  const availableYms = useMemo(() => Array.from(new Set(availableDates.map(d => d.slice(0, 7)))).sort(), [availableDates]);
  const ymIdx = availableYms.indexOf(ym);
  const canGoPrev = availableYms.some(m => m < ym);
  const canGoNext = availableYms.some(m => m > ym);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [...Array(firstDow).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  }

  return (
    <div style={{ padding: '14px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', maxWidth: '320px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <button onClick={() => shiftMonth(-1)} disabled={!canGoPrev}
          style={{ background: 'none', border: 'none', color: canGoPrev ? 'var(--text-primary)' : 'var(--text-faint)', cursor: canGoPrev ? 'pointer' : 'default', fontSize: '16px', padding: '2px 6px' }}>◀</button>
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{year}년 {month}월</span>
        <button onClick={() => shiftMonth(1)} disabled={!canGoNext}
          style={{ background: 'none', border: 'none', color: canGoNext ? 'var(--text-primary)' : 'var(--text-faint)', cursor: canGoNext ? 'pointer' : 'default', fontSize: '16px', padding: '2px 6px' }}>▶</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '4px' }}>
        {DOW.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;
          const hasData = availableSet.has(date);
          const active = date === selected;
          const day = parseInt(date.slice(8, 10), 10);
          return (
            <button key={date} onClick={() => hasData && onSelect(date)} disabled={!hasData}
              style={{
                aspectRatio: '1', borderRadius: '6px', fontSize: '13px', fontWeight: active ? 700 : 500,
                border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                background: active ? 'rgba(var(--accent-rgb),0.2)' : hasData ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--accent-text)' : hasData ? 'var(--text-secondary)' : 'var(--text-faint)',
                cursor: hasData ? 'pointer' : 'default',
              }}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
