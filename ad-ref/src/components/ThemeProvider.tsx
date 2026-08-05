'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void }>({
  theme: 'dark', toggleTheme: () => {}, setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

// layout.tsx의 인라인 스크립트가 hydration 전에 이미 <html data-theme>를 정해두므로,
// 여기서는 그 값을 그대로 읽어와서 state와 동기화만 한다(깜빡임 방지).
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
    setThemeState(current);
  }, []);

  const applyTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  };

  const toggleTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
