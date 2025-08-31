import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
    // Removed proxy configuration to avoid connection errors
    // The UI will use mock data instead
  },
  preview: {
    port: 9081
    // No proxy in preview mode either
  }
})
