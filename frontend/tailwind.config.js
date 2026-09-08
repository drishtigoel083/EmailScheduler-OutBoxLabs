
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#00A844',
          light: '#E8F5E9',
          dark: '#008A38',
          muted: '#2d9d78',
          border: '#00A844',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          input: '#F5F5F5',
          editor: '#F8F9FA',
          hover: '#F5F5F5',
        },
        text: {
          primary: '#1A1A1A',
          secondary: '#757575',
          muted: '#BDBDBD',
        },
        border: {
          DEFAULT: '#E0E0E0',
          light: '#EEEEEE',
        },
        badge: {
          scheduled: '#FF8C42',
          sent: '#E8E8E8',
        },
      },
      borderRadius: {
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        modal: '0 4px 24px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
