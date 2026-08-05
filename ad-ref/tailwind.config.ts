const config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'grid-cols-3',
    'grid-cols-6',
    'sm:grid-cols-6',
    'grid-cols-2',
    'sm:grid-cols-3',
    'md:grid-cols-4',
    'lg:grid-cols-5',
    'xl:grid-cols-6',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
