/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // A calm slate/indigo palette — pleasant to look at (req #5).
        zmkay: {
          bg: "#0f1115",
          panel: "#181b22",
          panel2: "#1f232c",
          edge: "#2a2f3a",
          key: "#262b35",
          keyhi: "#2f3644",
          text: "#e6e9ef",
          muted: "#8b93a7",
          accent: "#7c9cff",
          accent2: "#a78bfa",
          good: "#54d18c",
          warn: "#f0b860",
          bad: "#f0726f",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
