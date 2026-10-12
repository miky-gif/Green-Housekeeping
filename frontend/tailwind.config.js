/** Tokens Green Housekeeping (variables CSS --sg-*), alignés sur l'identité de l'hôtel. */
/** @type {import('tailwindcss').Config} */
const archivo = ['"Archivo Variable"', 'system-ui', 'sans-serif'];

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sg: {
          bg: 'var(--sg-bg)', surface: 'var(--sg-surface)', 'surface-2': 'var(--sg-surface-2)',
          line: 'var(--sg-line)', 'line-strong': 'var(--sg-line-strong)',
          ink: 'var(--sg-ink)', 'ink-2': 'var(--sg-ink-2)', 'ink-3': 'var(--sg-ink-3)',
          on: 'var(--sg-on)', 'on-soft': 'var(--sg-on-soft)', 'on-ink': 'var(--sg-on-ink)', 'on-fg': 'var(--sg-on-fg)', led: 'var(--sg-led)',
          warn: 'var(--sg-warn)', 'warn-soft': 'var(--sg-warn-soft)', err: 'var(--sg-err)', 'err-soft': 'var(--sg-err-soft)',
        },
        // Marque : décor uniquement, jamais porteur d'un état.
        lobby: { DEFAULT: 'var(--sg-lobby)', 2: 'var(--sg-lobby-2)', ink: 'var(--sg-lobby-ink)', 'ink-2': 'var(--sg-lobby-ink-2)' },
        accent: { DEFAULT: 'var(--sg-accent)', ink: 'var(--sg-accent-ink)' },
        demo: { bg: '#26224A', deep: '#1A1736', accent: '#C9C2FF', 'accent-ink': '#1B1740', line: '#8F86E8', ink: '#EEEAFE' },
      },
      // Une seule famille (Archivo, variable en graisse et en largeur) :
      // display = capitales larges, mono = chiffres tabulaires.
      fontFamily: { display: archivo, sans: archivo, mono: archivo },
      fontSize: {
        'kiosk-tag': ['22px', { letterSpacing: '0.14em', fontWeight: '600' }],
        display: ['34px', '40px'],
        counter: ['52px', '52px'],
        room: ['34px', '34px'],
        title: ['16px', '21px'],
        meta: ['14px', '19px'],
        overline: ['11px', { letterSpacing: '0.12em' }],
      },
      borderRadius: { 'sg-xs': '4px', 'sg-sm': '6px', 'sg-md': '8px', 'sg-lg': '10px' },
      boxShadow: { sg: 'var(--sg-shadow)', raised: 'var(--sg-raised)' },
      transitionDuration: { sync: '650ms', switch: '180ms' },
    },
  },
  plugins: [],
};
