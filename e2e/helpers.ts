import { type BrowserContext, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..', 'output', 'chrome-mv3');

/**
 * Launch a Chrome instance with the extension loaded.
 * Returns the browser context and a helper to get the extension's service worker.
 */
export async function launchWithExtension() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  });

  // Wait for service worker
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker');
  }

  const extensionId = sw.url().split('/')[2];

  return { context, extensionId, sw };
}

/**
 * Open the sidepanel page directly (for testing UI without needing sidePanel API).
 */
export async function openSidepanelPage(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.waitForLoadState('domcontentloaded');
  return page;
}
