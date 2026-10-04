import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4180',
    timezoneId: 'America/Chicago',
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: {
    command: 'npm start -- --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: false,
    env: {
      VITE_RECAPTCHA_SITE_KEY: ''
    }
  }
})
