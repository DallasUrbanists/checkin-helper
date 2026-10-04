import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'


// Meetup's iCal feed sends no CORS headers, so the browser reads it through this proxy
const icalProxy = {
  '/meetup-ical': {
    target: 'https://www.meetup.com',
    changeOrigin: true,
    rewrite: () => '/dallasurbanists/events/ical/'
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  resolve: {
    alias: command === 'serve' && mode === 'e2e' && process.env.CHECKIN_E2E === '1' ? [
      { find: /.*\/composables\/firebase\.js$|^\.\/firebase\.js$/, replacement: fileURLToPath(new URL('./tests/auth-fixture.js', import.meta.url)) },
      { find: /.*\/composables\/operationCapability\.js$|^\.\/operationCapability\.js$/, replacement: fileURLToPath(new URL('./tests/operation-capability-fixture.js', import.meta.url)) }
    ] : []
  },
  base: '/checkin-helper/',
  plugins: [vue()],
  server: {
    port: 8080,
    proxy: icalProxy
  },
  preview: {
    proxy: icalProxy
  },
  css: {
    preprocessorOptions: {
        scss: {
          silenceDeprecations: [
            'import',
            'color-functions',
            'global-builtin',
            'legacy-js-api',
            'if-function',
          ],
        },
    },
  },
}))
