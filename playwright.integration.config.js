import { defineConfig, devices } from '@playwright/test'

// Separate from mocked E2E: fresh servers, one serial in-memory database, no retries.
export default defineConfig({
  testDir: './tests/integration',
  testMatch: '**/*.integration.js',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4186',
    timezoneId: 'America/Chicago',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'node ..\\cloud-api-server\\node_modules\\tsx\\dist\\cli.mjs tests\\integration\\server.ts',
      url: 'http://127.0.0.1:4196/__integration/ready',
      reuseExistingServer: false,
      timeout: 60000,
      env: { NODE_ENV: 'test' }
    },
    {
      command: 'node node_modules\\vite\\bin\\vite.js --config tests\\integration\\vite.config.js --mode integration --host 127.0.0.1 --port 4186 --strictPort',
      url: 'http://127.0.0.1:4186/checkin-helper/tests/integration/adapter.html',
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: 'http://127.0.0.1:4196',
        VITE_API_KEY: 'isolated-integration-key',
        VITE_RECAPTCHA_SITE_KEY: ''
      }
    }
  ]
})
