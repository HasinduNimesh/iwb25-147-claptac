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
    port: 5173,
    proxy: {
      '/graphql': 'http://localhost:9080',
      '/gql': 'http://localhost:9080',
      '/tariff': 'http://localhost:9080',
      '/ontology': 'http://localhost:9080',
      '/advice': 'http://localhost:9080'
    }
  }
})
