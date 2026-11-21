import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import postcss from './postcss.config.js'

const apiProxy = { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Load the same Tailwind 3 pipeline in dev and build, including after config edits.
  css: { postcss },
  server: { host: 'localhost', port: 5173, strictPort: true, proxy: apiProxy },
  preview: { host: 'localhost', port: 4173, strictPort: true, proxy: apiProxy },
})
