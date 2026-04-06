/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        sidebar: "#171717",
        surface: "#212121",
        "surface-secondary": "#2f2f2f",
        "surface-hover": "#2a2a2a",
        border: "#3f3f3f",
        "text-primary": "#ececec",
        "text-secondary": "#8e8ea0",
        "text-muted": "#6b7280",
        accent: "#10a37f",
        "accent-hover": "#1a7f64",
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#ececec",
            code: {
              color: "#ececec",
              backgroundColor: "#374151",
              borderRadius: "0.25rem",
              padding: "0.125rem 0.25rem",
            },
            "pre code": {
              backgroundColor: "transparent",
              padding: 0,
            },
          },
        },
      },
    },
  },
  plugins: [],
};
