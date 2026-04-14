import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, 'output/chrome-mv3');

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    headless: false, // Chrome extensions require headed mode
  },
  projects: [
    {
      name: 'chromium',
      use: {
        launchOptions: {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-first-run',
            '--disable-default-apps',
          ],
        },
      },
    },
  ],
});
