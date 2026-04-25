import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ✅ CORRECTION
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: {
    proxy: {
      '/api/extended': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/nado': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
