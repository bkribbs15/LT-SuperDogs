/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', 'Impact', 'sans-serif'],
        sans:    ['Barlow', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'Menlo', 'monospace'],
      },

      // ── Palette — "Saturday Chalk" ──────────────────────────────────────
      colors: {
        dog: {
          navy:      '#16264A',  // primary — stadium night
          darknavy:  '#0C1730',
          softnavy:  '#3C5385',
          orange:    '#E4572E',  // the SuperDog accent
          darkorange:'#B7431F',
          gold:      '#E3B23C',  // 1st place / highlights
          chalk:     '#F2F3F0',
        },
        surface: {
          base:    '#EAECE8',
          chalk:   '#F2F3F0',
          raised:  '#FAFBF9',
          overlay: '#FFFFFF',
        },
        text: {
          primary:   '#141A26',
          secondary: '#2B3342',
          muted:     '#5A6472',
          dim:       '#8791A0',
          gold:      '#946F12',
          orange:    '#C4441C',
        },
        result: {
          upset: '#1F8A5A',
          cover: '#2E7DB5',
          loss:  '#C0392B',
          push:  '#7A8590',
          live:  '#E4572E',
        },
      },

      backgroundImage: {
        'navy-gradient':   'linear-gradient(135deg, #16264A 0%, #0C1730 100%)',
        'orange-gradient': 'linear-gradient(135deg, #E4572E 0%, #B7431F 100%)',
        'gold-gradient':   'linear-gradient(135deg, #E3B23C 0%, #C9952A 100%)',
      },

      boxShadow: {
        'glass':     '0 8px 30px rgba(22,38,74,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-lg':  '0 18px 50px rgba(22,38,74,0.14), inset 0 1px 0 rgba(255,255,255,0.7)',
        'stat':      '0 6px 22px rgba(22,38,74,0.08)',
        'orange':    '0 8px 24px rgba(228,87,46,0.28)',
      },

      borderColor: {
        glass:         'rgba(22, 38, 74, 0.12)',
        'glass-hover': 'rgba(22, 38, 74, 0.24)',
      },

      keyframes: {
        fadeIn:    { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideUp:   { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        livePulse: { '0%, 100%': { opacity: '1', transform: 'scale(1)' }, '50%': { opacity: '0.5', transform: 'scale(0.85)' } },
      },
      animation: {
        'fade-in':    'fadeIn 0.5s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in':   'scaleIn 0.3s ease-out',
        'live-pulse': 'livePulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
