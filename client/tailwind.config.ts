import type { Config } from 'tailwindcss';

// Every colour comes from CSS variables in src/design/tokens.css (single source of truth).
// Components use semantic names (bg-surface, text-fg, border-line), never raw hex.
const channel = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: channel('--color-primary-50'),
          100: channel('--color-primary-100'),
          200: channel('--color-primary-200'),
          300: channel('--color-primary-300'),
          400: channel('--color-primary-400'),
          500: channel('--color-primary-500'),
          600: channel('--color-primary-600'),
          700: channel('--color-primary-700'),
        },
        app: channel('--color-bg'),
        surface: channel('--color-surface'),
        surface2: channel('--color-surface-2'),
        line: channel('--color-border'),
        fg: channel('--color-text'),
        muted: channel('--color-text-muted'),
        success: channel('--color-success'),
        warning: channel('--color-warning'),
        danger: channel('--color-danger'),
        info: channel('--color-info'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: { soft: 'var(--ease)' },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      maxWidth: { content: 'var(--content-max)' },
      width: { sidebar: 'var(--sidebar-w)' },
      spacing: { sidebar: 'var(--sidebar-w)' },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up var(--dur-base) var(--ease) both',
      },
    },
  },
  plugins: [],
} satisfies Config;

