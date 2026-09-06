/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0c0e12',
        surface: '#12151b',
        raised: '#171b22',
        hover: '#1c212a',
        line: '#232936',
        'line-strong': '#2f3644',
        ink: '#e7eaf0',
        muted: '#8d95a6',
        subtle: '#646c7c',
        accent: {
          DEFAULT: '#4f8ff0',
          soft: '#7fb2f5',
          dim: '#1e2c44',
        },
        critical: '#f0616d',
        high: '#f0913f',
        medium: '#dcb544',
        low: '#4fa3d1',
        info: '#8d95a6',
        good: '#4bb58a',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(0, 0, 0, 0.4)',
        pop: '0 12px 32px rgba(0, 0, 0, 0.55)',
      },
    },
  },
  plugins: [],
}
