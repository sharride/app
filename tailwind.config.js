/** @type {import('tailwindcss').Config} */
// NOTE: this project uses Tailwind v4's CSS-first config (`@theme` block in
// src/index.css) as the actual source of truth for colors — that's what
// generates the `text-primary-*` / `bg-primary-*` / etc. utility classes.
// This file's `theme.extend.colors` previously drifted out of sync (still
// on the old teal palette after index.css moved to Fire/Energy orange),
// which meant two different color definitions existed for the same token
// names. As part of the Teal-primary + Orange-accent refinement, this file
// has been re-synced to match src/index.css's @theme block exactly —
// same hex values, same contrast-driven 500/600/700 shifts — so there is
// a single consistent source of truth regardless of which config Tailwind
// ends up reading colors from.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#0f766e',
          600: '#115e59',
          700: '#134e4a',
          800: '#0f3f3c',
          900: '#0c3330',
        },
        primary: {
          DEFAULT: '#0f766e',
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#0f766e',
          600: '#115e59',
          700: '#134e4a',
        },
        accent: {
          DEFAULT: '#ea580c',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
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
