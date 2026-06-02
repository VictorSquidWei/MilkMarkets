import type { Config } from 'tailwindcss';

// Kalshi-like, milk-themed, now with light/dark. `ink` (text/contrast) and `paper` (surface)
// are driven by CSS variables so the whole app flips with the `.dark` class. yes/no/milk are fixed.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        milk: { 50: '#FBFAF7', 100: '#F4F2EB', 200: '#E9E5DA', 300: '#D8D3C5' },
        yes: { DEFAULT: '#0E9F6E', soft: '#E6F6EF', dark: '#0A7D56' },
        no: { DEFAULT: '#E5484D', soft: '#FCECEC', dark: '#C2353A' },
      },
      borderRadius: { xl: '0.9rem', '2xl': '1.1rem', '3xl': '1.5rem' },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,17,20,0.04), 0 6px 20px -8px rgba(16,17,20,0.10)',
        pop: '0 24px 60px -24px rgba(16,17,20,0.45)',
      },
    },
  },
  plugins: [],
} satisfies Config;
