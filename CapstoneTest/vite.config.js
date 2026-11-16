// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost/CapstoneTest/backend/api',
    },
  },
  build: {
    // Optimize build size
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor dependencies into separate chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          'motion-vendor': ['framer-motion'],
          'date-vendor': ['date-fns', 'dayjs'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/database', 'firebase/storage']
        }
      }
    },
    // Enable source map for debugging production builds
    sourcemap: true,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Configure chunk size warnings
    chunkSizeWarningLimit: 500
  }
});
