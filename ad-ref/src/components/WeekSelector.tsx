'use client';

import { useMemo, useState } from 'react';
import { buildMonthWeekSlots, getAvailableYearMonths, getYearMonthOfKey } from '@/lib/weekUtils';

interface WeekSelectorProps {
  weekKeys: string[]; // 데이터가 존재하는 월/주차 키 목록 (정렬 무관)
  selected: string | null;
  onSelect: (key: string) => void;
}

// 주차가 계속 쌓여도 화면이 지저분해지지 않도록, 전체 주차를 한 줄에 나열하는 대신
// 달력처럼 월 단위로 넘겨보고 그 달의 주차만 보여주는 방식으로 구성
export default function WeekSelector({ weekKeys, selected, onSelect }: WeekSelectorProps) {
  const weekKeySet = useMemo(() => new Set(weekKeys), [weekKeys]);
  const availableMonths = useMemo(() => getAvailableYearMonths(weekKeys), [weekKeys]); // 오름차순 "YYYY-MM"

  const initialMonth = (selected ? getYearMonthOfKey(selected) : availableMonths[availableMonths.length - 1])
    || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [ym, setYm] = useState(initialMonth);

  if (weekKeys.length === 0) return null;

  const [yearStr, monthStr] = ym.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const monthIdx = availableMonths.indexOf(ym);
  const canGoPrev = monthIdx > 0 || monthIdx === -1;
  const canGoNext = monthIdx !== -1 && monthIdx < availableMonths.length - 1;

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const slots = buildMonthWeekSlots(year, month);

  return (
    <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700 }}>수집 주차</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => shiftMonth(-1)} disabled={!canGoPrev}
            style={{ background: 'none', border: 'none', color: canGoPrev ? 'var(--text-primary)' : 'var(--text-faint)', cursor: canGoPrev ? 'pointer' : 'default', fontSize: '16px', padding: '2px 6px' }}>◀</button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '80px', textAlign: 'center' }}>{year}년 {month}월</span>
          <button onClick={() => shiftMonth(1)} disabled={!canGoNext}
            style={{ background: 'none', border: 'none', color: canGoNext ? 'var(--text-primary)' : 'var(--text-faint)', cursor: canGoNext ? 'pointer' : 'default', fontSize: '16px', padding: '2px 6px' }}>▶</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {slots.map(slot => {
          const hasData = weekKeySet.has(slot.key);
          const active = slot.key === selected;
          return (
            <button key={slot.key} onClick={() => hasData && onSelect(slot.key)} disabled={!hasData}
              style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: active ? 700 : 500,
                border: `1px solid ${active ? 'var(--accent)' : hasData ? 'var(--border)' : '#26263200'}`,
                background: active ? 'var(--accent-soft)' : hasData ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--accent-text)' : hasData ? 'var(--text-secondary)' : 'var(--text-faint)',
                cursor: hasData ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
              }}>
              {slot.weekNum}주차 ({month}/{slot.startDay}~{month}/{slot.endDay})
            </button>
          );
        })}
      </div>
    </div>
  );
}
