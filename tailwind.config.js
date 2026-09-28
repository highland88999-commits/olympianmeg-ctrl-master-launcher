/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        jet: "#030303",
        cerberus: {
          toxic: "#39ff14",
          blood: "#ff003c",
          ocean: "#00f2ff",
          void: "#b026ff",
        },
      },
    },
  },
  plugins: [],
}


