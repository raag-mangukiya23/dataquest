/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        primary: v('primary'),
        'primary-ink': v('primary-ink'),
        fit: v('fit'),
        market: v('market'),
        afford: v('afford'),
        roi: v('roi'),
        family: v('family'),
        disrupt: v('disrupt'),
        ok: v('ok'),
        warn: v('warn'),
        loan: v('loan'),
        bad: v('bad'),
        neon: v('neon'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '16px' },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--primary) / .35), 0 8px 40px -12px rgb(var(--primary) / .45)',
        lift: '0 18px 50px -24px rgb(0 0 0 / .55)',
      },
      maxWidth: { page: '1240px' },
    },
  },
  plugins: [],
}
