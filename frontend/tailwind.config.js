/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: { relative: true, files: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ] },
  theme: {
    extend: {
      colors: {
        emerald: { 600: '#047857', 700: '#065f46' },
        amber: { 500: '#b45309', 600: '#92400e' },
        blue: { 50: '#eefaf7', 100: '#d2f2e8', 200: '#a8e5d5', 300: '#70d1b9', 400: '#36b699', 500: '#16977e', 600: '#107c69', 700: '#116354', 800: '#125044', 900: '#104338', 950: '#052923' },
        gray: { 50: '#f5f7fa', 100: '#edf1f6', 200: '#dfe5ee', 300: '#c7d1df', 400: '#8a99af', 500: '#61718a', 600: '#485973', 700: '#34445e', 800: '#22324b', 900: '#15243b', 950: '#0b1729' },
      },
    },
  },
  plugins: [],
}
