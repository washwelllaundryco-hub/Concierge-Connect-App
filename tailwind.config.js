/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "washwell-black": "#0d0d0c",
        "washwell-black-light": "#2a2a28",
        "washwell-black-pale": "#1a1a18",
        "washwell-cream": "#fffff7",
        "washwell-green": "#00c419",
        "washwell-green-light": "#33d147",
        "washwell-green-pale": "#e6f9ea",
        "washwell-green-dark": "#00a015",
        "washwell-gray": "#adada9",
        "washwell-gray-light": "#d6d6d4",
        "washwell-gray-dark": "#8a8a87",
      },
      fontFamily: {
        display: ["Poppins", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      borderWidth: {
        3: "3px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      boxShadow: {
        "washwell-sm": "0 1px 3px rgba(13, 13, 12, 0.08)",
        "washwell-md": "0 4px 12px rgba(13, 13, 12, 0.1)",
        "washwell-lg": "0 8px 24px rgba(13, 13, 12, 0.12)",
        "washwell-xl": "0 16px 40px rgba(13, 13, 12, 0.15)",
        "washwell-green": "0 0 20px rgba(0, 196, 25, 0.3)",
      },
    },
  },
  plugins: [],
};
