import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Only synthetic Firebase is aliased. Capability and the operation adapter are production modules.
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  base: '/checkin-helper/',
  envDir: false,
  resolve: {
    alias: [{
      find: /.*\/composables\/firebase\.js$|^\.\/firebase\.js$/,
      replacement: fileURLToPath(new URL('../auth-fixture.js', import.meta.url))
    }]
  },
  server: { host: '127.0.0.1', port: 4186, strictPort: true }
})
