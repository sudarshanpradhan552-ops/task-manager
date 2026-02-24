import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',      // listen on all interfaces — accessible via LAN IP
    port: 5173,
    proxy: {
      // Proxy API requests to the FastAPI backend
      '/api': {
        target: 'http://10.172.225.37:8000',
        changeOrigin: true,
      },
      '/token': {
        target: 'http://10.172.225.37:8000',
        changeOrigin: true,
      },
      '/signup': {
        target: 'http://10.172.225.37:8000',
        changeOrigin: true,
      },
      '/tasks': {
        target: 'http://10.172.225.37:8000',
        changeOrigin: true,
      },
      '/users': {
        target: 'http://10.172.225.37:8000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://10.172.225.37:8000',
        changeOrigin: true,
      },
      '/push': {
        target: 'http://10.172.225.37:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://10.172.225.37:8000',
        ws: true,            // WebSocket proxying
        changeOrigin: true,
      },
    },
  },
})

