import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Serve the AcquireIQ frontend under /acquireiq/.
  base: '/acquireiq/',

  plugins: [react()],

  server: {
    port: 5174,

    proxy: {
      // Infrastructure endpoints such as /api/health.
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },

      // Acquisition request endpoints.
      '/requests': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },

      // Dashboard endpoint.
      '/dashboard': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },

      // AI-assisted query endpoint.
      '/assist': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})