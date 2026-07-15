/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // 정적 파일로 빌드 (Vercel에서도 동작)
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
}

module.exports = nextConfig
