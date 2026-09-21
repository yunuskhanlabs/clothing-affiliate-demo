/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0E0E10",
          soft: "#141417",
        },
        surface: {
          DEFAULT: "#17171A",
          raised: "#1D1D21",
        },
        border: {
          DEFAULT: "#26262B",
          strong: "#333338",
        },
        paper: {
          DEFAULT: "#F2F0EC",
          muted: "#C8C6C0",
          dim: "#8B8983",
        },
        tag: {
          DEFAULT: "#FF3D57",
          hover: "#FF5C73",
          soft: "#3A1620",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["clamp(2.75rem, 6vw + 1rem, 6.5rem)", { lineHeight: "0.98", letterSpacing: "-0.02em" }],
        "display-lg": ["clamp(2.25rem, 4vw + 1rem, 4.25rem)", { lineHeight: "1.02", letterSpacing: "-0.01em" }],
        "section-head": ["clamp(1.5rem, 1.5vw + 1rem, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
      },
      maxWidth: {
        content: "1360px",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "mesh-drift": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(3%, -4%) scale(1.06)" },
        },
        "mesh-drift-reverse": {
          "0%, 100%": { transform: "translate(0, 0) scale(1.05)" },
          "50%": { transform: "translate(-4%, 3%) scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.4, 0, 0.2, 1) both",
        "mesh-drift": "mesh-drift 18s ease-in-out infinite",
        "mesh-drift-reverse": "mesh-drift-reverse 22s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
