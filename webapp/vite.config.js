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
    host: true, // listen on 0.0.0.0 for LAN access
    port: 5173,
    proxy: {
      // GraphQL and REST go through UI gateway
      '/graphql': { target: 'http://localhost:9080', changeOrigin: true },
      '/gql': { target: 'http://localhost:9080', changeOrigin: true },
      '/tariff': { target: 'http://localhost:9080', changeOrigin: true },
      '/ontology': { target: 'http://localhost:9080', changeOrigin: true },
      '/advice': { target: 'http://localhost:9080', changeOrigin: true },
      '/config': { target: 'http://localhost:9080', changeOrigin: true },
      '/billing': { target: 'http://localhost:9080', changeOrigin: true },
      '/scheduler': { target: 'http://localhost:9080', changeOrigin: true },
      // Auth direct to auth service
      '/auth': { target: 'http://localhost:8087', changeOrigin: true }
    }
  },
  preview: {
    host: true,
    port: 9081
    // No proxy in preview mode either
  }
})
