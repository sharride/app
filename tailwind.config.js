/** @type {import('tailwindcss').Config} */
// NOTE: this project uses Tailwind v4's CSS-first config (`@theme` block in
// src/index.css) as the actual source of truth for colors — that's what
// generates the `text-primary-*` / `bg-primary-*` / etc. utility classes.
// This file's `theme.extend.colors` was left on the old teal palette after
// index.css was updated to the Fire/Energy orange palette (Phase 5), which
// meant two different color definitions existed for the same token names —
// depending on Tailwind's v4 merge order that's either a silent conflict or,
// worse, this file silently winning and the whole "Fire/Energy" rebrand
// never actually reaching the compiled CSS. Kept in sync here as a safety
// net either way; if `content`-glob-only detection turns out to be all v4
// still needs from this file, the `colors` block below is inert but no
// longer wrong. See src/index.css's @theme block for the values these
// mirror, including the contrast-driven 500/600/700 shifts.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#c2410c',
          600: '#9a3412',
          700: '#7c2d12',
          800: '#6c2e0f',
          900: '#5a260d',
        },
        primary: {
          DEFAULT: '#c2410c',
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#c2410c',
          600: '#9a3412',
          700: '#7c2d12',
        },
        accent: {
          DEFAULT: '#f59e0b',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f8faf9'
        },
        neutral: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563'
        },
        success: {
          DEFAULT: '#15803d'
        },
        warning: {
          DEFAULT: '#b45309'
        },
        danger: {
          DEFAULT: '#dc2626'
        }
      },
      fontFamily: {
        sans: ['Cairo', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue'],
      }
    },
  },
  plugins: [],
}
