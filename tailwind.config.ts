import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--color-bg)",
          card:    "var(--color-bg-card)",
          raised:  "var(--color-bg-raised)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          light:   "var(--color-border-light)",
        },
        accent: { DEFAULT: "#C9956B", dim: "#C9956B33" },
        muted: {
          DEFAULT: "var(--color-muted)",
          light:   "var(--color-muted-light)",
        },
        success: "#4CAF50",
        warning: "#FFA726",
        danger:  "#EF5350",
      },
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "serif"],
        sans:  ["DM Sans", "Segoe UI", "sans-serif"],
        mono:  ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
