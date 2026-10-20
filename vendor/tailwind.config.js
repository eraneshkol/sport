// The theme that used to live in the inline `tailwind.config` block in
// index.html, back when Tailwind was a just-in-time compiler loaded from a
// CDN. It is baked into vendor/tailwind.css now — see vendor/README.md.
module.exports = {
  content: ['./app.jsx', './index.html'],
  theme: {
    extend: {
      fontFamily: {
        sf: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        iosbg: '#F2F2F7',
        ioscard: '#FFFFFF',
        iosblue: '#007AFF',
        iosgreen: '#34C759',
        iosred: '#FF3B30',
        iosorange: '#FF9500',
        iossecondary: '#8E8E93',
        iosseparator: '#E5E5EA',
        ioslabel: '#1C1C1E',
      },
    },
  },
};
