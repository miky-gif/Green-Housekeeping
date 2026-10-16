/** Tokens GreenKeeping (variables CSS de la maquette, clair et sombre). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: 'var(--orange-50)', 100: 'var(--orange-100)', 200: 'var(--orange-200)', 500: 'var(--orange-500)', 600: 'var(--orange-600)' },
        ink: { 900: 'var(--ink-900)', 700: 'var(--ink-700)', 500: 'var(--ink-500)', 300: 'var(--ink-300)' },
        line: 'var(--line)',
        surface: 'var(--surface)',
        canvas: 'var(--canvas)',
        ok: { text: 'var(--ok-text)', bg: 'var(--ok-bg)', dot: 'var(--ok-dot)' },
        info: { text: 'var(--info-text)', bg: 'var(--info-bg)', dot: 'var(--info-dot)' },
        mute: { text: 'var(--mute-text)', bg: 'var(--mute-bg)', dot: 'var(--mute-dot)' },
        err: { text: 'var(--err-text)', bg: 'var(--err-bg)' },
        warn: { text: 'var(--warn-text)', bg: 'var(--warn-bg)' },
      },
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'] },
      boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)' },
      borderRadius: { card: '16px', btn: '10px' },
      transitionDuration: { switch: '180ms' },
    },
  },
  plugins: [],
};
