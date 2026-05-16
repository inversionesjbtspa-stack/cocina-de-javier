import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f8faf8",
          100: "#edf2ee",
          500: "#466f56",
          700: "#2f4d3b",
          900: "#183024"
        }
      }
    }
  },
  plugins: []
};

export default config;
