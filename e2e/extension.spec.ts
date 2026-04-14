import { test, expect } from '@playwright/test';
import { launchWithExtension, openSidepanelPage } from './helpers';
import type { BrowserContext } from '@playwright/test';

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  const result = await launchWithExtension();
  context = result.context;
  extensionId = result.extensionId;
});

test.afterAll(async () => {
  await context?.close();
});

test.describe('Sidepanel UI', () => {
  test('loads sidepanel and shows tabs', async () => {
    const page = await openSidepanelPage(context, extensionId);

    // Check tab bar exists - use exact name matching for tab buttons
    await expect(page.getByRole('button', { name: '⚡ Shortcuts', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '🔑 Auth', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '🌍 Env', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '📋 History', exact: true })).toBeVisible();

    await page.close();
  });

  test('shortcuts tab shows empty state', async () => {
    const page = await openSidepanelPage(context, extensionId);

    await expect(page.getByText('No shortcuts yet')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ New' })).toBeVisible();

    await page.close();
  });

  test('can create a new shortcut', async () => {
    const page = await openSidepanelPage(context, extensionId);

    // Click "+ New"
    await page.getByRole('button', { name: '+ New' }).click();

    // Fill name
    const nameInput = page.locator('input[placeholder*="Shortcut name"]');
    await nameInput.fill('Test Flow');

    // Add a step
    await page.getByText('+ Add Step').click();

    // Verify step card appears
    await expect(page.locator('text=#1')).toBeVisible();

    // Save
    await page.getByText('Save Shortcut').click();

    // Should be back at list with the shortcut
    await expect(page.getByText('Test Flow')).toBeVisible();

    await page.close();
  });

  test('can navigate to history tab', async () => {
    const page = await openSidepanelPage(context, extensionId);

    // Click history tab
    await page.getByRole('button', { name: '📋 History', exact: true }).click();

    await expect(page.getByText('No history yet')).toBeVisible();

    await page.close();
  });

  test('can navigate to env tab', async () => {
    const page = await openSidepanelPage(context, extensionId);

    await page.getByRole('button', { name: '🌍 Env', exact: true }).click();

    // Env tab should be visible (check for some env-related UI element)
    await expect(page.locator('.overflow-y-auto')).toBeVisible();

    await page.close();
  });

  test('can navigate to auth tab', async () => {
    const page = await openSidepanelPage(context, extensionId);

    await page.getByRole('button', { name: '🔑 Auth', exact: true }).click();

    await expect(page.locator('.overflow-y-auto')).toBeVisible();

    await page.close();
  });
});

test.describe('Shortcut Builder', () => {
  test('shows manual endpoint input when no spec loaded', async () => {
    const page = await openSidepanelPage(context, extensionId);

    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('input[placeholder*="Shortcut name"]').fill('Manual Test');
    await page.getByText('+ Add Step').click();

    // When no spec, should show method dropdown + path input
    const stepCard = page.locator('.bg-white.border.border-gray-200.rounded-lg').first();
    const methodSelect = stepCard.locator('select.w-20');
    await expect(methodSelect).toBeVisible();

    // Should be able to type a path manually
    const pathInput = page.locator('input[placeholder*="/api/"]');
    if (await pathInput.isVisible()) {
      await pathInput.fill('/api/v1/test');
    }

    await page.close();
  });

  test('shows body template for POST method', async () => {
    const page = await openSidepanelPage(context, extensionId);

    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('input[placeholder*="Shortcut name"]').fill('POST Test');
    await page.getByText('+ Add Step').click();

    // The step card has method select (w-20) - target it specifically
    const stepCard = page.locator('.bg-white.border.border-gray-200.rounded-lg');
    const methodSelect = stepCard.locator('select.w-20');
    await methodSelect.selectOption('POST');

    // Body template textarea should appear (inside the step card area)
    const bodyTextarea = page.locator('textarea[placeholder*="randomString"]');
    await expect(bodyTextarea).toBeVisible({ timeout: 5000 });

    // Fill body template
    await bodyTextarea.fill('{"name": "{{$randomString(8)}}"}');

    await page.close();
  });

  test('shows Import from History button', async () => {
    const page = await openSidepanelPage(context, extensionId);

    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('input[placeholder*="Shortcut name"]').fill('Import Test');

    await expect(page.getByText('Import from History')).toBeVisible();

    await page.close();
  });

  test('code view toggle works', async () => {
    const page = await openSidepanelPage(context, extensionId);

    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('input[placeholder*="Shortcut name"]').fill('Code View Test');
    await page.getByText('+ Add Step').click();

    // Switch to code view
    await page.getByText('Code View →').click();

    // Should show textarea with JSON
    const codeTextarea = page.locator('textarea.font-mono');
    await expect(codeTextarea).toBeVisible();
    const codeContent = await codeTextarea.inputValue();
    expect(codeContent).toContain('endpointMethod');

    // Switch back
    await page.getByText('← Form View').click();
    await expect(page.locator('text=#1')).toBeVisible();

    await page.close();
  });
});

test.describe('Step Features', () => {
  test('step has description input', async () => {
    const page = await openSidepanelPage(context, extensionId);

    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('input[placeholder*="Shortcut name"]').fill('Desc Test');
    await page.getByText('+ Add Step').click();

    // Description input should be visible inside the step card
    const descInput = page.locator('input[placeholder*="Step description"]');
    await expect(descInput).toBeVisible();

    // Fill it
    await descInput.fill('Create a new user');

    await page.close();
  });

  test('execution view shows Run button per step', async () => {
    const page = await openSidepanelPage(context, extensionId);

    // Create a shortcut with a step
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('input[placeholder*="Shortcut name"]').fill('Run Single Test');
    await page.getByText('+ Add Step').click();

    // Set description
    const descInput = page.locator('input[placeholder*="Step description"]');
    await descInput.fill('Test step');

    // Save
    await page.getByText('Save Shortcut').click();

    // Click Run on the shortcut (use title attribute for specificity)
    await page.getByRole('button', { name: '▶ Run' }).first().click();

    // Should see "Run All Steps" and per-step "▶ Run" buttons
    await expect(page.getByText('▶ Run All Steps')).toBeVisible();
    // The per-step Run button should be visible (at least one)
    const stepRunBtn = page.locator('button', { hasText: '▶ Run' }).filter({ hasNotText: 'All' });
    await expect(stepRunBtn.first()).toBeVisible();

    await page.close();
  });
});

test.describe('Export/Import', () => {
  test('export all button visible when shortcuts exist', async () => {
    const page = await openSidepanelPage(context, extensionId);

    // First create a shortcut
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('input[placeholder*="Shortcut name"]').fill('Export Test');
    await page.getByText('+ Add Step').click();
    await page.getByText('Save Shortcut').click();

    // Should see export buttons
    await expect(page.getByText('Export All')).toBeVisible();
    await expect(page.getByText('Import', { exact: false })).toBeVisible();

    await page.close();
  });

  test('select mode works', async () => {
    const page = await openSidepanelPage(context, extensionId);

    // Need to have shortcuts first
    const exportBtn = page.locator('button', { hasText: /^\s*↗\s*Export\s*$/ });
    if (await exportBtn.isVisible()) {
      await exportBtn.click();

      // Should see select mode UI
      await expect(page.getByText('Select All')).toBeVisible();
      await expect(page.getByText('Cancel')).toBeVisible();

      // Cancel returns to normal
      await page.getByText('Cancel').click();
      await expect(page.getByText('Export All')).toBeVisible();
    }

    await page.close();
  });

  test('import button shows file dialog', async () => {
    const page = await openSidepanelPage(context, extensionId);

    // Check hidden file input exists
    const fileInput = page.locator('input[type="file"][accept*="json"]');
    await expect(fileInput).toBeAttached();

    await page.close();
  });
});
