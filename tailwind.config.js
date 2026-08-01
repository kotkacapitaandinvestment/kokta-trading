/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter var"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Warm, bronze-tinted neutral scale anchored at the exact brand
        // blacks (950/900) — ties the grayscale to the gold identity in
        // both light and dark mode instead of a cool blue-gray.
        ink: {
          950: '#050504', // Primary Background (brand-exact)
          900: '#0C0C0E', // Secondary Surface (brand-exact)
          800: '#171512',
          700: '#262320',
          600: '#3D3833',
          500: '#6B6259',
          400: '#948A7D',
          300: '#B8AE9F',
          200: '#DDD6C9',
          100: '#EDE8DD',
          50: '#F7F4EE',
        },
        // Gold scale — 400-900 anchor the 6 given brand golds/bronzes
        // exactly; 50-300 are generated lighter tints for badges/backgrounds.
        accent: {
          50: '#FBF3E4',
          100: '#F6E7CB',
          200: '#EDD4A0',
          300: '#E4C078',
          400: '#F4D48E', // Highlight Gold
          500: '#D1A85B', // Primary Gold
          600: '#B58637', // Supporting Gold
          700: '#936E33', // Bronze
          800: '#654F2F', // Deep Bronze
          900: '#49351E', // Dark Bronze
        },
        // Deepened toward institutional restraint (forest green / brick red)
        // rather than bright saturated defaults — gold stays reserved for
        // accents/CTAs, not overloaded onto win/loss semantics.
        profit: {
          50: '#EAF6F0',
          400: '#5AB98C',
          500: '#3D9970',
          600: '#2F7A56',
        },
        loss: {
          50: '#FBEEEC',
          400: '#DB7269',
          500: '#C24A3F',
          600: '#A83B32',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(17, 19, 24, 0.04), 0 1px 8px 0 rgba(17, 19, 24, 0.04)',
        'card-hover': '0 2px 4px 0 rgba(17, 19, 24, 0.06), 0 4px 16px 0 rgba(17, 19, 24, 0.08)',
        pop: '0 8px 30px rgba(17, 19, 24, 0.12)',
      },
      borderRadius: {
        xl: '0.625rem',
        '2xl': '0.875rem',
        '3xl': '1.125rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
