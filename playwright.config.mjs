import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4190);

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.mjs',
  globalSetup: './test/e2e/global-setup.mjs',
  timeout: 45_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        // headless machines (CI, sandboxes) have no reliable speaker; use Chromium's fake audio sink
        '--disable-audio-output',
      ],
    },
  },
  webServer: {
    command: `node scripts/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
