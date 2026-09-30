/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // NOTE (Phase 2b): dead tokens `jet` and `cerberus.*` removed — zero
      // usages repo-wide. Canonical palette lives in lib/design-tokens.js.
    },
  },
  plugins: [],
}


