import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: process.env['CI'] ? 'list' : [['list']],

  use: {
    baseURL: 'http://localhost:5179',
    trace: 'retain-on-failure',
  },

  // Эталон хранится с суффиксом платформы. Рендер текста на Windows и Ubuntu
  // отличается сглаживанием и подстановкой шрифтов, поэтому единый эталон
  // на все платформы гарантированно расходится по причине, не связанной
  // с кодом (ADR-006). CI сравнивает только linux-эталоны — просто потому,
  // что имя файла на нём другое.
  snapshotPathTemplate: 'e2e/__screenshots__/{arg}-{platform}{ext}',

  expect: {
    toHaveScreenshot: {
      // Порог взят из S7, где паритет рендера считался достигнутым при
      // расхождении меньше 0.1 % пикселей. Ужесточать до нуля нельзя:
      // сглаживание текста не воспроизводится побитово даже на одной машине.
      maxDiffPixelRatio: 0.001,
      threshold: 0.1,
    },
  },

  // Сборка запускается сама: иначе тест «зелёный локально, красный на CI»
  // будет означать «я забыл поднять сервер», а не свойство продукта.
  webServer: {
    command: 'pnpm --filter @player/playground dev',
    url: 'http://localhost:5179',
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
