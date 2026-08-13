/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // NIKKI brand guideline: Poppins as primary/heading typeface.
        // Separate token (not replacing `display`/`sans` globally) so
        // this only applies where used explicitly — the new landing
        // page — without touching the internal portal's Fraunces/Inter
        // pairing until that's approved too.
        poppins: ['Poppins', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // NIKKI master brand palette (see index.css :root for the
        // source values). Utility classes: bg-nikki-navy, text-nikki-blue,
        // border-nikki-border, etc.
        nikki: {
          navy: 'var(--nikki-navy)',
          royal: 'var(--nikki-royal)',
          blue: 'var(--nikki-blue)',
          sky: 'var(--nikki-sky)',
          background: 'var(--nikki-background)',
          surface: 'var(--nikki-surface)',
          'surface-blue': 'var(--nikki-surface-blue)',
          'text-primary': 'var(--nikki-text-primary)',
          'text-secondary': 'var(--nikki-text-secondary)',
          border: 'var(--nikki-border)',
          success: 'var(--nikki-success)',
          warning: 'var(--nikki-warning)',
          error: 'var(--nikki-error)',
        },
      },
    },
  },
  plugins: [],
};
