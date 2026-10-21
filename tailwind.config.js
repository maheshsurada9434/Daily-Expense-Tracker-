/** Colours are CSS variables (see src/index.css) so light and dark share one set of utility classes. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('bg'), card: v('card'), muted: v('muted'), border: v('border'), fg: v('fg'), sub: v('sub'),
        primary: v('primary'), 'on-primary': v('on-primary'), accent: v('accent'), violet: v('violet'),
        income: v('income'), expense: v('expense'), warn: v('warn'),
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgb(30 27 75 / 0.05), 0 8px 24px -12px rgb(30 27 75 / 0.12)' },
    },
  },
  plugins: [],
}
