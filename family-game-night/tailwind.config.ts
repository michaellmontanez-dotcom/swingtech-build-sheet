import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      colors: {
        grape: "#7c3aed",
        bubble: "#ec4899",
        sunny: "#facc15",
        mint: "#10b981",
        sky: "#0ea5e9",
        tangerine: "#f97316",
      },
      boxShadow: {
        pop: "0 6px 0 0 rgba(0,0,0,0.18)",
        "pop-sm": "0 4px 0 0 rgba(0,0,0,0.18)",
      },
      keyframes: {
        pop: { "0%": { transform: "scale(0.9)" }, "60%": { transform: "scale(1.05)" }, "100%": { transform: "scale(1)" } },
        wiggle: { "0%,100%": { transform: "rotate(-3deg)" }, "50%": { transform: "rotate(3deg)" } },
      },
      animation: {
        pop: "pop 0.25s ease-out",
        wiggle: "wiggle 0.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
