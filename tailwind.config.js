/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // A public ledger: warm paper, near-black ink, one deep green for locked or paid.
        paper: '#FBFAF7',
        ink: '#14171A',
        // Secondary text. 7.9:1 on the paper, so it stays readable (WCAG AAA for body text).
        soft: '#4A4F57',
        // The thin rule between ledger rows.
        rule: '#D6D1C4',
        lock: '#0F5C3A',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'sans-serif'],
        display: ['"Space Grotesk"', '"DM Sans"', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      // Root size is 17px (see index.css), so base text is 17px and the smallest text is about 15px.
      fontSize: {
        xs: ['0.9rem', '1.5'],
        sm: ['0.95rem', '1.55'],
        base: ['1rem', '1.6'],
        lg: ['1.15rem', '1.5'],
        xl: ['1.3rem', '1.4'],
        '2xl': ['1.55rem', '1.3'],
        '3xl': ['1.9rem', '1.2'],
        '4xl': ['2.4rem', '1.15'],
        '5xl': ['3.2rem', '1.05'],
        '6xl': ['4rem', '1'],
      },
    },
  },
  plugins: [],
}
