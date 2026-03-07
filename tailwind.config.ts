import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
        sidebar: {
          bg: "#1e293b",
          hover: "#334155",
          active: "#3b82f6",
          text: "#94a3b8",
          "text-active": "#f1f5f9",
        },
      },
      fontFamily: { sans: ["Pretendard", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
