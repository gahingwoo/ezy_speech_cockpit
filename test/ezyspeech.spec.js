// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The EzySpeech page in Cockpit, against the stand-in ezyspeech command
// (test/fake-ezyspeech): 4.1.9 installed, 4.2.0 available, 4.1.8 kept.

import { test, expect } from '@playwright/test';

const USER = process.env.TEST_USER || 'ezytester';
const PASSWORD = process.env.TEST_PASSWORD;

// Signs in with administrative access, as the page needs it for every action,
// and opens the module. Cockpit runs it in an iframe of its own.
async function open(page, { lang, user = USER } = {}) {
    if (!PASSWORD)
        throw new Error('Set TEST_PASSWORD to the test user\'s password');
    if (lang) {
        const url = test.info().project.use.baseURL;
        await page.context().addCookies([{ name: 'CockpitLang', value: lang, url }]);
    }
    await page.goto('/');
    const status = await page.evaluate(([user, password]) =>
        fetch('/cockpit/login', {
            headers: { Authorization: 'Basic ' + btoa(user + ':' + password), 'X-Superuser': 'any' },
        }).then(r => r.status), [user, PASSWORD]);
    expect(status).toBe(200);
    await page.goto('/ezyspeech');
    return page.frameLocator('iframe[name$="/ezyspeech"]');
}

test('shows what is installed and where to find it', async ({ page }) => {
    const app = await open(page);
    await expect(app.getByRole('heading', { name: 'EzySpeech 4.1.9' })).toBeVisible();
    await expect(app.getByText('Running', { exact: true })).toHaveCount(2);

    const listener = app.getByRole('link', { name: /ezyspeech\.example\.org/ });
    await expect(listener).toHaveAttribute('href', 'https://ezyspeech.example.org');
    await expect(app.getByText('Listener page, port 1915, 3 listening now')).toBeVisible();
    await expect(app.getByText('Releases kept: 4.1.8, 4.1.9')).toBeVisible();
});

test('switches between its tabs', async ({ page }) => {
    const app = await open(page);
    await expect(app.getByRole('heading', { name: 'EzySpeech 4.1.9' })).toBeVisible();

    await app.getByRole('tab', { name: 'Updates' }).click();
    await expect(app.getByText('Available', { exact: true })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Update to 4.2.0' })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Roll back to 4.1.8' })).toBeVisible();
    await expect(app.getByText('Listener page, port 1915, 3 listening now')).toBeHidden();

    await app.getByRole('tab', { name: 'Password and backups' }).click();
    await expect(app.getByText('Hashed', { exact: true })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Back up now' })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Update to 4.2.0' })).toBeHidden();
});

test('updates, and shows how it went', async ({ page }) => {
    const app = await open(page);
    await app.getByRole('tab', { name: 'Updates' }).click();
    await app.getByRole('button', { name: 'Update to 4.2.0' }).click();
    // An alert's title starts with a word for screen readers ("Success alert:").
    await expect(app.locator('.pf-v6-c-alert.pf-m-success .pf-v6-c-alert__title')).toContainText('Updated.');
});

test('asks before rolling back', async ({ page }) => {
    const app = await open(page);
    await app.getByRole('tab', { name: 'Updates' }).click();
    await app.getByRole('button', { name: 'Roll back to 4.1.8' }).click();

    const dialog = app.getByRole('dialog', { name: 'Roll back to 4.1.8?' });
    await expect(dialog).toContainText('listeners lose the stream for a few seconds');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await app.getByRole('button', { name: 'Roll back to 4.1.8' }).click();
    await dialog.getByRole('button', { name: 'Roll back' }).click();
    await expect(app.locator('.pf-v6-c-alert.pf-m-success .pf-v6-c-alert__title')).toContainText('Back on 4.1.8.');
});

test('asks before stopping, and not before restarting', async ({ page }) => {
    const app = await open(page);
    await app.getByRole('button', { name: 'Stop', exact: true }).click();
    const dialog = app.getByRole('dialog', { name: 'Stop EzySpeech?' });
    await expect(dialog).toContainText('Everyone listening is cut off');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await app.getByRole('button', { name: 'Restart' }).click();
    await expect(app.getByRole('dialog')).toHaveCount(0);
    await expect(app.getByRole('button', { name: 'Restart' })).toBeEnabled();
});

test('sets an admin password typed in, twice', async ({ page }) => {
    const app = await open(page);
    await app.getByRole('tab', { name: 'Password and backups' }).click();
    await app.getByRole('button', { name: 'Set a new admin password' }).click();
    await app.getByLabel('I will type it').check();

    const set = app.getByRole('button', { name: 'Set this password' });
    await app.getByLabel('New password').fill('typed-in-test-pass');
    await app.getByLabel('Again').fill('typed-in-test-past');
    await expect(app.getByText('They do not match')).toBeVisible();
    await expect(set).toBeDisabled();

    await app.getByLabel('Again').fill('typed-in-test-pass');
    await expect(set).toBeEnabled();
    await set.click();
    await expect(app.getByText('The new admin password is set; the servers restarted.')).toBeVisible();
});

test('shows memory, and CPU once it has two readings', async ({ page }) => {
    const app = await open(page);
    const usage = app.locator('.pf-v6-c-card', { has: app.getByRole('heading', { name: 'Usage' }) });
    await expect(usage.getByText('Operator\'s console')).toBeVisible();
    await expect(usage.getByText(/of memory/).first()).toBeVisible();
    await expect(usage.getByText('Transcripts')).toBeVisible();
    // The page polls every 10 seconds; the second reading gives the load.
    await expect(usage.getByText(/CPU: \d+\.\d%/).first()).toBeVisible({ timeout: 30_000 });
});

test('keeps web requests out of the log until asked for', async ({ page }) => {
    const app = await open(page);
    const log = app.locator('.ezy-log');
    await expect(log).toContainText('Translated a line for 3 listeners');
    await expect(log).not.toContainText('GET /api/health');

    await app.getByText('Web requests', { exact: true }).click();
    await expect(log).toContainText('GET /api/health');
});

test('speaks Chinese when Cockpit does', async ({ page }) => {
    const app = await open(page, { lang: 'zh-cn' });
    await expect(app.getByRole('tab', { name: '更新' })).toBeVisible();
    await expect(app.getByText('运行中', { exact: true })).toHaveCount(2);
});

test('names a Podman install, and shows its one container', async ({ page }) => {
    // As this user, the stand-in command reports a Podman install.
    const app = await open(page, { user: 'ezypodman' });
    await expect(app.getByText('Podman', { exact: true })).toBeVisible();
    const usage = app.locator('.pf-v6-c-card', { has: app.getByRole('heading', { name: 'Usage' }) });
    await expect(usage.getByText('Container')).toBeVisible();
    await expect(usage.getByText('CPU: 1.5%')).toBeVisible();
});
