import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        // keep the client's Host header so the server's same-origin
        // WebSocket origin check (Origin host === Host) still passes
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2020',
  },
})
