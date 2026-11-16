/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Make sure this is set
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}", // All your component and page files
  ],
  theme: {
    extend: {
      keyframes: {
        'rotate-counter': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(-360deg)' }, // counter-clockwise
        },
      },
      animation: {
        'sync-spin': 'rotate-counter 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};

