import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fffaf7",
          100: "#f7ebe7",
          500: "#9b2f3f",
          700: "#6f1729",
          900: "#2b1018"
        },
        gold: {
          100: "#f4ead7",
          500: "#b9975b",
          700: "#80683f"
        }
      }
    }
  },
  plugins: []
};

export default config;
