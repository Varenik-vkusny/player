import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: process.env['CI'] ? 'list' : [['list']],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },

  // Сборка запускается сама: иначе тест «зелёный локально, красный на CI»
  // будет означать «я забыл поднять сервер», а не свойство продукта.
  webServer: {
    command: 'pnpm --filter @player/playground dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        // headless: аудио в Chromium играет и без звукового устройства,
        // а часы строятся на контекстном времени.
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
