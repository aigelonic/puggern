import { defineConfig } from '@playwright/test';

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: externalBaseURL || 'http://127.0.0.1:4173',
    browserName: 'chromium',
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'python3 -m http.server 4173 --directory frontend',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 10_000,
      },
});
