/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // SignLine design tokens. Brand colour: light green (owner's choice, 2026-10-16; the logo itself stays orange). Legacy `mudra` palette below
        // stays until every page is migrated.
        sl: {
          // light green fills carry dark text; green-700 is the readable green for text on cream
          green: { DEFAULT: '#A8E063', 50: '#F4FBEC', 100: '#E6F7D3', 200: '#CDEFA8', 500: '#A8E063', 600: '#8BCB3F', 700: '#3D7314' },
          cream: { DEFAULT: '#FBF5EC', 50: '#FFFDF9', 100: '#FBF5EC', 200: '#F4EADB', 300: '#E9DCC8' },
          ink: { DEFAULT: '#1C1917', 900: '#1C1917', 700: '#3A3532', 600: '#57524D', 400: '#8A847D', 200: '#D6CFC5' },
          purple: { DEFAULT: '#6D4AFF', 50: '#F3F0FF', 100: '#E6DFFF', 500: '#6D4AFF', 600: '#5A37EE', 700: '#4526C7' },
          sun: { DEFAULT: '#FFD84D', 100: '#FFF6CC', 700: '#7A5A00' }, // completed / badge accent
          sky: { DEFAULT: '#9DD6FF', 100: '#E5F4FF', 700: '#0B5D94' },
          pink: { DEFAULT: '#FF6FA5', 100: '#FFE4EF', 700: '#A3134D' },
        },
        // Legacy palette used by the older pages, remapped to SignLine tones (same class names):
        // ivory -> cream, lavender -> purple, indigo -> ink, peach -> green, gold -> sun.
        mudra: {
          ivory: { DEFAULT: '#FBF5EC', 50: '#FFFDF9', 100: '#FBF5EC', 200: '#F4EADB', 300: '#E9DCC8' },
          lavender: { DEFAULT: '#6D4AFF', 50: '#F7F5FF', 100: '#EEEAFF', 200: '#DCD3FF', 300: '#BFB0FF', 400: '#957DFF', 500: '#6D4AFF', 600: '#5A37EE', 700: '#4526C7', 800: '#341D96', 900: '#24146A' },
          indigo: { DEFAULT: '#1C1917', 50: '#FAF7F2', 100: '#F1ECE4', 200: '#DDD5CA', 300: '#B5ADA2', 400: '#6E675F', 500: '#57524D', 600: '#45403C', 650: '#3E3936', 700: '#2E2A27', 800: '#231F1D', 900: '#1C1917', 950: '#141210' },
          peach: { DEFAULT: '#BDE88A', warm: '#3D7314', 50: '#F4FBEC', 100: '#E6F7D3', 200: '#CDEFA8', 300: '#BDE88A', 400: '#A8E063', 500: '#5E9E24' },
          gold: { DEFAULT: '#FFD84D', 50: '#FFFBEA', 100: '#FFF6CC', 200: '#FFEC99', 300: '#FFE270', 400: '#FFD84D', 500: '#E6B800', 600: '#7A5A00' },
          purple: { DEFAULT: '#6D4AFF', soft: '#BFB0FF', deep: '#4526C7' },
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Plus Jakarta Sans', 'sans-serif'],
      },
      borderRadius: {
        sl: '1.25rem',
        'sl-lg': '1.75rem',
      },
      boxShadow: {
        // offset "drawn" shadows of the SignLine style (black outline + solid offset)
        'sl': '4px 4px 0 0 #1C1917',
        'sl-sm': '2px 2px 0 0 #1C1917',
        'sl-soft': '0 10px 30px -12px rgba(28, 25, 23, 0.18)',
        'glass': '0 8px 32px 0 rgba(47, 41, 79, 0.08)',
        'glass-hover': '0 14px 40px 0 rgba(47, 41, 79, 0.14)',
        'glass-active': '0 20px 48px -10px rgba(124, 58, 237, 0.2)',
        'glow-lavender': '0 0 25px -3px rgba(139, 92, 246, 0.35)',
        'glow-peach': '0 0 25px -3px rgba(251, 146, 60, 0.35)',
        'glow-gold': '0 0 25px -3px rgba(212, 175, 55, 0.35)',
      },
      animation: {
        'sl-bridge': 'sl-bridge 1.4s ease-out forwards',
        'sl-hands': 'sl-hands 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'sl-progress': 'sl-progress 1.2s ease-in-out infinite',
        'sl-in-left': 'sl-in-left 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s both',
        'sl-in-right': 'sl-in-right 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s both',
        'sl-draw': 'sl-draw 1.1s ease-in-out 0.9s both',
        'sl-fade-up': 'sl-fade-up 0.6s ease-out both',
        'float-slow': 'float 6s ease-in-out infinite',
        'float-reverse': 'float-reverse 7s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'orbit': 'orbit 20s linear infinite',
        'shimmer': 'shimmer 2.5s infinite linear',
        'wave': 'wave 1.5s ease-in-out infinite',
      },
      keyframes: {
        'sl-bridge': { '0%': { strokeDashoffset: '120' }, '60%, 100%': { strokeDashoffset: '0' } },
        'sl-hands': { '0%': { transform: 'scale(0.86) rotate(-6deg)', opacity: '0' }, '100%': { transform: 'scale(1) rotate(0)', opacity: '1' } },
        'sl-progress': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(250%)' } },
        'sl-in-left': { '0%': { opacity: '0', transform: 'translateX(-28px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'sl-in-right': { '0%': { opacity: '0', transform: 'translateX(28px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'sl-draw': { '0%': { strokeDashoffset: '1' }, '100%': { strokeDashoffset: '0' } },
        'sl-fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'float-reverse': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(10px)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.02)' },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg) translateX(120px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(120px) rotate(-360deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        wave: {
          '0%, 100%': { height: '8px' },
          '50%': { height: '28px' },
        }
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
