import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Accord Background System ──────────────────────────────────
        bg: {
          deep: '#080D1A',    // near-black navy — deep trust
          surface: '#0E1526', // card backgrounds
          elevated: '#162035', // modals, dropdowns
          border: '#1E2D4A',  // subtle card borders
        },
        // ── Accord Brand ──────────────────────────────────────────────
        accord: {
          blue: '#4F8EF7',    // primary actions
          violet: '#8B5CF6',  // Arca / AI elements
          emerald: '#10B981', // success, released payments
          amber: '#F59E0B',   // pending / warning
          red: '#EF4444',     // disputes / errors
        },
        // ── Text ──────────────────────────────────────────────────────
        text: {
          primary: '#E2E8F5',
          secondary: '#7B8DB0',
          tertiary: '#3D4F6A',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        display: ['3rem', { fontWeight: '800', letterSpacing: '-0.04em', lineHeight: '1.1' }],
        'display-sm': ['2rem', { fontWeight: '800', letterSpacing: '-0.04em', lineHeight: '1.15' }],
      },
      boxShadow: {
        'glow-blue': '0 0 24px 0 rgba(79, 142, 247, 0.25)',
        'glow-violet': '0 0 24px 0 rgba(139, 92, 246, 0.25)',
        'glow-emerald': '0 0 24px 0 rgba(16, 185, 129, 0.25)',
        'card': '0 4px 24px 0 rgba(0, 0, 0, 0.4)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-accord': 'linear-gradient(135deg, #4F8EF7 0%, #8B5CF6 100%)',
        'gradient-emerald': 'linear-gradient(135deg, #10B981 0%, #4F8EF7 100%)',
        'grid-pattern': `
          linear-gradient(rgba(79, 142, 247, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(79, 142, 247, 0.04) 1px, transparent 1px)
        `,
      },
      backgroundSize: {
        'grid': '48px 48px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'seal-stamp': 'seal-stamp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'seal-stamp': {
          '0%': { transform: 'scale(0) rotate(-15deg)', opacity: '0' },
          '70%': { transform: 'scale(1.15) rotate(3deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};

export default config;
