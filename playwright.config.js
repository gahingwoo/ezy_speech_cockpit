// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The browser tests: a Cockpit at COCKPIT_URL, with the module and the
// stand-in ezyspeech command installed (test/prepare-host.sh does that).

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'test',
    timeout: 60_000,
    expect: { timeout: 15_000 },
    // One Cockpit, one log of what the page asked for: tests take turns.
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: process.env.COCKPIT_URL || 'https://localhost:9090',
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        // On a developer's machine, the Chrome that is already there; CI
        // installs Playwright's own.
        ...(process.env.CI ? {} : { channel: 'chrome' }),
    },
});
