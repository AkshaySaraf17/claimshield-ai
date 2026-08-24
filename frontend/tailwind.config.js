/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ledger/casework palette — the world of an appeals desk, not a
        // generic SaaS blue. Ink for authority, ledger for reversals granted,
        // denial for what's being contested, parchment for the paper trail.
        ink: {
          950: "#12181f",
          900: "#1a232d",
          700: "#2f3d4b",
          500: "#5b6b7a",
          300: "#a4b2bd",
        },
        ledger: {
          50: "#eef6f3",
          500: "#1f7a5c",
          600: "#186047",
          700: "#134a37",
        },
        denial: {
          50: "#fdf3ea",
          500: "#c1652b",
          600: "#a1531f",
        },
        parchment: "#f6f3ec",
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
