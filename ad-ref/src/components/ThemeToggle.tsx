'use client';

import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      onClick={toggleTheme}
      title={isLight ? '다크 모드로 전환' : '라이트 모드로 전환'}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '20px',
        padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500,
      }}
    >
      <span>{isLight ? '☀️' : '🌙'}</span>
      {isLight ? '라이트' : '다크'}
    </button>
  );
}
