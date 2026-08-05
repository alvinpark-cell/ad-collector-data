'use client';

import { CSSProperties } from 'react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const buttonStyle = (active: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '6px',
    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: '20px',
    padding: '6px 12px', cursor: 'pointer',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: '14px', fontWeight: 500,
  });

  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      <button onClick={() => setTheme('light')} title="라이트 모드" style={buttonStyle(theme === 'light')}>
        <span>☀️</span>라이트
      </button>
      <button onClick={() => setTheme('dark')} title="다크 모드" style={buttonStyle(theme === 'dark')}>
        <span>🌙</span>다크
      </button>
    </div>
  );
}
