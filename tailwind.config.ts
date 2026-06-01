import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* Material Design 3 — Tech-Noir token palette */
        "surface-variant": "#353534",
        "surface-container-lowest": "#0e0e0e",
        "on-error": "#690005",
        "on-secondary-fixed": "#180065",
        "surface-tint": "#3cd7ff",
        "on-primary-container": "#00586b",
        "inverse-surface": "#e5e2e1",
        "on-tertiary-container": "#005d27",
        "on-secondary-container": "#b8afff",
        tertiary: "#66fa8c",
        "on-surface": "#e5e2e1",
        "on-background": "#e5e2e1",
        "tertiary-container": "#45dd73",
        background: "#131313",
        "surface-bright": "#3a3939",
        "on-surface-variant": "#bbc9cf",
        "outline-variant": "#3c494e",
        surface: "#131313",
        "inverse-primary": "#00677e",
        "on-primary-fixed-variant": "#004e5f",
        "on-primary-fixed": "#001f27",
        "surface-dim": "#131313",
        "surface-container-low": "#1c1b1b",
        secondary: "#c7bfff",
        "surface-container-highest": "#353534",
        "surface-container": "#201f1f",
        "surface-container-high": "#2a2a2a",
        error: "#ffb4ab",
        "primary-fixed": "#b4ebff",
        "on-secondary": "#2b009e",
        "error-container": "#93000a",
        "on-tertiary-fixed-variant": "#005321",
        "secondary-container": "#442bbd",
        "secondary-fixed": "#e4deff",
        "on-error-container": "#ffdad6",
        primary: "#a8e8ff",
        "secondary-fixed-dim": "#c7bfff",
        "inverse-on-surface": "#313030",
        outline: "#859398",
        "tertiary-fixed": "#6bff8f",
        "primary-fixed-dim": "#3cd7ff",
        "on-tertiary-fixed": "#002109",
        "primary-container": "#00d4ff",
        "tertiary-fixed-dim": "#4ae176",
        "on-tertiary": "#003915",
        "on-secondary-fixed-variant": "#4228bb",
        "on-primary": "#003642",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        base: "4px",
        gutter: "16px",
        margin: "24px",
      },
      fontFamily: {
        "headline-lg": ["var(--font-inter)", "sans-serif"],
        "technical-sm": ["var(--font-mono)", "monospace"],
        "headline-lg-mobile": ["var(--font-inter)", "sans-serif"],
        "body-md": ["var(--font-inter)", "sans-serif"],
        "technical-xs": ["var(--font-mono)", "monospace"],
        "display-lg": ["var(--font-inter)", "sans-serif"],
      },
      fontSize: {
        "headline-lg": [
          "32px",
          { lineHeight: "40px", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "technical-sm": ["14px", { lineHeight: "20px", fontWeight: "500" }],
        "headline-lg-mobile": [
          "24px",
          { lineHeight: "32px", fontWeight: "600" },
        ],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "technical-xs": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "display-lg": [
          "48px",
          { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
      },
      animation: {
        "pulse-ring":
          "pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite",
        "wave-bounce": "wave-bounce 1s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
        "pulse-glow":
          "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.5" },
          "100%": { transform: "scale(1.5)", opacity: "0" },
        },
        "wave-bounce": {
          "0%, 100%": { transform: "scaleY(0.5)" },
          "50%": { transform: "scaleY(1)" },
        },
        "pulse-glow": {
          "0%, 100%": {
            opacity: "0.8",
            boxShadow: "0 0 10px #442bbd",
          },
          "50%": { opacity: "1", boxShadow: "0 0 20px #442bbd" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
