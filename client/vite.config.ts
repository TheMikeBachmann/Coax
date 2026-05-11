import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../web/public'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/video': 'http://localhost:8000',
      '/xmltv.xml': 'http://localhost:8000',
      '/lineup.json': 'http://localhost:8000',
      '/device.xml': 'http://localhost:8000',
      '/images': 'http://localhost:8000',
      '/cache': 'http://localhost:8000',
    },
  },
})
