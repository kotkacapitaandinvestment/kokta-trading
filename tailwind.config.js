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
        ink: {
          950: '#0a0b0d',
          900: '#111318',
          800: '#1a1d24',
          700: '#282c35',
          600: '#3d4250',
          500: '#585f70',
          400: '#7a8195',
          300: '#a3aabb',
          200: '#ccd1dd',
          100: '#e6e9ef',
          50: '#f5f6f9',
        },
        accent: {
          50: '#eef3ff',
          100: '#dfe8ff',
          200: '#c1d1ff',
          300: '#96aeff',
          400: '#6b84fb',
          500: '#4a5df0',
          600: '#3a42d6',
          700: '#3033ac',
          800: '#282c88',
          900: '#25286c',
        },
        profit: {
          50: '#ecfdf5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        loss: {
          50: '#fef2f2',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(17, 19, 24, 0.04), 0 1px 8px 0 rgba(17, 19, 24, 0.04)',
        'card-hover': '0 2px 4px 0 rgba(17, 19, 24, 0.06), 0 4px 16px 0 rgba(17, 19, 24, 0.08)',
        pop: '0 8px 30px rgba(17, 19, 24, 0.12)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
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
