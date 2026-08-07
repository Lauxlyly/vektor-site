// Playwright config for VEKTOR render guardrails. Isolated to ./e2e so it never
// picks up the node-based unit tests in ./test.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://vektor-site-xi.vercel.app',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
