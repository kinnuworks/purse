/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // The Engraved Plate (see DESIGN.md). Colour tokens, exactly as specified.
      colors: {
        paper: '#F6F2E9',
        plate: '#FCFAF4',
        ink: '#1C1A15',
        // --ink-2: secondary text, at least 7:1 on the paper.
        soft: '#4F4A3F',
        rule: '#DDD6C6',
        brass: '#7A5C1E',
        paid: '#1F5C3F',
        lock: '#1F5C3F',
        alert: '#9A2B1F',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Newsreader', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      // Body is 17px on a phone and 18px from 640px up (set on <body>); small is 15px.
      fontSize: {
        xs: ['0.9375rem', '1.5'],
        sm: ['0.9375rem', '1.5'],
        base: ['1em', '1.6'],
        lg: ['1.0625em', '1.6'],
        xl: ['1.5rem', '1.25'],
        '2xl': ['1.75rem', '1.2'],
        '3xl': ['2rem', '1.15'],
        '4xl': ['2.375rem', '1.1'],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '2px',
        md: '4px',
        lg: '4px',
        xl: '4px',
      },
    },
  },
  plugins: [],
}
