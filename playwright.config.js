const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8765',
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'
  },
  webServer: {
    command: 'node tools/static-server.cjs',
    url: 'http://127.0.0.1:8765/index.html',
    reuseExistingServer: true,
    timeout: 120000
  }
});
