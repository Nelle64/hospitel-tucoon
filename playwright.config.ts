import { defineConfig, devices } from '@playwright/test';

const viewport = (name: string, width: number, height: number) => ({
  name,
  use: { ...devices['iPhone 13'], browserName: 'chromium' as const, viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'reports/playwright.json' }], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { baseURL: 'http://localhost:4173/hospitel-tucoon/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [viewport('iphone-320x568', 320, 568), viewport('iphone-375x667', 375, 667), viewport('iphone-390x844', 390, 844), viewport('iphone-430x932', 430, 932)],
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/hospitel-tucoon/', reuseExistingServer: true, timeout: 60_000 },
});
