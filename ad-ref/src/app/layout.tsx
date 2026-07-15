import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AD Ref - 광고 레퍼런스',
  description: '경쟁사 광고 레퍼런스 모니터링',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-[#0f0f13]">{children}</body>
    </html>
  )
}
