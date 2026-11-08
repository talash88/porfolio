import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const proxyTarget = loadEnv(mode, '.', 'API_PROXY_').API_PROXY_TARGET || 'http://127.0.0.1:3001'

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: proxyTarget.replace(/^http/, 'ws'),
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
  }
})
