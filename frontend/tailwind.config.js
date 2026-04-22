/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        outfit: ["Outfit", "sans-serif"],
        serif: ["Source Serif 4", "serif"],
      },
      colors: {
        ceramic: {
          DEFAULT: '#F4F3F1',
          surface: '#ECEAE8',
          recessed: '#E4E1DC',
          border: '#DFDDD9',
          'border-secondary': '#D4D0CC',
        },
        indigo: {
          DEFAULT: '#2B4066',
          wash: '#EBEEF4',
          'border': '#D0D4E0',
          muted: '#B8C4D6',
        },
        green: {
          DEFAULT: '#38D670',
          badge: '#28C060',
        },
        yellow: {
          DEFAULT: '#C8A800',
          wash: '#FDFCF4',
          'border': '#E8E2C0',
        },
        rose: {
          DEFAULT: '#7E4452',
          border: '#C4A4AA',
          bg: '#E6DEDF',
          label: '#9A8088',
        },
        signal: {
          red: '#D04040',
        },
        text: {
          primary: '#28261E',
          student: '#3A3834',
          secondary: '#6A6862',
          muted: '#8A8880',
          faint: '#9A9894',
        },
        history: {
          bg: '#E9E7E4',
          'system-border': '#C0BEB8',
          'system-text': '#6A6860',
          'student-border': '#D4D2CC',
          'student-text': '#8A8880',
        },
        // Legacy aliases for pages not yet updated
        accent: {
          DEFAULT: '#C4714A',
          hover: '#B0623C',
        },
        student: {
          DEFAULT: '#2C2825',
        },
        muted: {
          DEFAULT: '#6B6560',
        },
        interim: {
          DEFAULT: '#A09890',
        },
        destructive: {
          DEFAULT: '#B91C1C',
        },
      },
    },
  },
  plugins: [],
};
