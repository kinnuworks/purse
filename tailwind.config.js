/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // One ink, one green. Everything else on screen is the ink at lower strength.
        ink: '#10151C',
        lock: '#0B7A4B',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'sans-serif'],
        display: ['"Space Grotesk"', '"DM Sans"', 'ui-sans-serif', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
