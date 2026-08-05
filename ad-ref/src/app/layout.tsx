import type { Metadata } from 'next'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'AD Ref - 광고 레퍼런스',
  description: '경쟁사 광고 레퍼런스 모니터링',
}

// hydration 전에 <html data-theme>를 미리 설정해서 다크/라이트 전환 시 첫 페인트에서
// 잘못된 테마가 잠깐 보이는 깜빡임(flash)을 막는다.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
