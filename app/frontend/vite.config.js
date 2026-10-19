import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: false,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/events': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/labels': 'http://127.0.0.1:8000',
      '/library': 'http://127.0.0.1:8000',
      '/letters': 'http://127.0.0.1:8000',
      '^/models$': 'http://127.0.0.1:8000',
      '/isl500': 'http://127.0.0.1:8000',
      '/common-word': 'http://127.0.0.1:8000',
      '/model-video-examples': 'http://127.0.0.1:8000',
      '^/model$': 'http://127.0.0.1:8000',
      '/phrases': 'http://127.0.0.1:8000',
      '/predict': 'http://127.0.0.1:8000',
      '/recordings': 'http://127.0.0.1:8000',
      '/reference': 'http://127.0.0.1:8000',
      '/stream': {
        target: 'http://127.0.0.1:8000',
        ws: true
      }
    }
  }
})
