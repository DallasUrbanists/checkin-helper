import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'


// Meetup's iCal feed sends no CORS headers, so the browser reads it through this proxy
const icalProxy = {
  '/meetup-ical': {
    target: 'https://www.meetup.com',
    changeOrigin: true,
    rewrite: () => '/dallasurbanists/events/ical/'
  }
}

// https://vitejs.dev/config/
export default defineConfig({
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
})
