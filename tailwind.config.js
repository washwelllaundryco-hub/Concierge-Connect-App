/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        'washwell-black':      '#0d0d0c',
        'washwell-black-light':'#2a2a28',
        'washwell-cream':      '#fffff7',
        'washwell-green':      '#00c419',
        'washwell-green-dark': '#009914',
        'washwell-green-pale': '#e8faea',
        'washwell-gray':       '#adada9',
        'washwell-gray-light': '#d6d6d4',
        'washwell-gray-dark':  '#6b6b69',
      },
      fontFamily: {
        display: ['Montserrat', 'sans-serif'],
        body:    ['Montserrat', 'sans-serif'],
        mono:    ['Montserrat', 'monospace'],
      },
      boxShadow: {
        'washwell-green': '0 0 20px rgba(0, 196, 25, 0.3)',
      },
    },
  },
  plugins: [],
}
