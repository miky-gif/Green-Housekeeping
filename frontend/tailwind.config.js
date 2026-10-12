/** Tokens repris tels quels des maquettes SunyGreen (variables CSS --sg-*). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sg: {
          bg: 'var(--sg-bg)', surface: 'var(--sg-surface)', 'surface-2': 'var(--sg-surface-2)',
          line: 'var(--sg-line)', 'line-strong': 'var(--sg-line-strong)',
          ink: 'var(--sg-ink)', 'ink-2': 'var(--sg-ink-2)', 'ink-3': 'var(--sg-ink-3)',
          on: 'var(--sg-on)', 'on-soft': 'var(--sg-on-soft)', 'on-ink': 'var(--sg-on-ink)', 'on-fg': 'var(--sg-on-fg)',
          warn: 'var(--sg-warn)', 'warn-soft': 'var(--sg-warn-soft)', err: 'var(--sg-err)', 'err-soft': 'var(--sg-err-soft)',
        },
        // Ambiance hôtel : décor uniquement, jamais porteur d'un état.
        lobby: { DEFAULT: 'var(--sg-lobby)', 2: 'var(--sg-lobby-2)', ink: 'var(--sg-lobby-ink)', 'ink-2': 'var(--sg-lobby-ink-2)' },
        brass: { DEFAULT: 'var(--sg-brass)', soft: 'var(--sg-brass-soft)', ink: 'var(--sg-brass-ink)' },
        demo: { bg: '#26224A', deep: '#1A1736', accent: '#C9C2FF', 'accent-ink': '#1B1740', line: '#8F86E8', ink: '#EEEAFE' },
      },
      fontFamily: {
        display: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'kiosk-state': ['38px', { lineHeight: '41px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'kiosk-tag': ['26px', { letterSpacing: '0.16em', fontWeight: '600' }],
        display: ['40px', '44px'],
        counter: ['60px', '60px'],
        room: ['38px', '38px'],
        title: ['17px', '22px'],
        meta: ['14px', '19px'],
        overline: ['12px', { letterSpacing: '0.08em' }],
      },
      borderRadius: { 'sg-xs': '6px', 'sg-sm': '8px', 'sg-md': '12px', 'sg-lg': '14px' },
      boxShadow: { sg: 'var(--sg-shadow)' },
      transitionDuration: { sync: '650ms', switch: '180ms' },
    },
  },
  plugins: [],
};
