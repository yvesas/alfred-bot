import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#10a37f",
          fg: "#ffffff",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
