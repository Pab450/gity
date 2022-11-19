/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js}', './site/**/*.md'],
  theme: {
    extend: {}
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
  darkMode: 'class'
}
