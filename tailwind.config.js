import colors from "tailwindcss/colors";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral (zinc) replaces the blue-tinted slate everywhere `slate-*` is used.
        slate: colors.zinc,
        canvas: "#09090B",
        surface: {
          DEFAULT: "#0E0E11",
          elevated: "#141418",
          card: "#0E0E11",
          input: "#0B0B0E",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        // Flat by default: structure comes from hairlines, not shadows.
        card: "none",
        modal: "0 24px 64px -16px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.07)",
      },
    },
  },
  plugins: [],
};
