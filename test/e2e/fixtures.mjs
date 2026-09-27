import { test as base, expect } from '@playwright/test';

/**
 * Every test gets a page that records console errors, page errors and every network request.
 * After each test: no console errors, and no request other than the game page itself.
 */
export const test = base.extend({
  // One browser process per test: Chromium's audio service is shared by every page in a browser,
  // and on some headless hosts it fails for the second page that plays sound. Isolation keeps
  // each test honest about its own console output.
  context: async ({ playwright, viewport, launchOptions, reducedMotion, baseURL }, use) => {
    const browser = await playwright.chromium.launch(launchOptions);
    const context = await browser.newContext({ viewport, reducedMotion, baseURL });
    await use(context);
    await browser.close();
  },
  watch: [
    async ({ page }, use) => {
      const w = { errors: [], requests: [] };
      page.on('console', (m) => {
        if (m.type() === 'error') w.errors.push(m.text());
      });
      page.on('pageerror', (e) => w.errors.push(String(e)));
      page.on('request', (r) => w.requests.push(r.url()));
      await use(w);
      // release camera/mic/audio cleanly before the browser context goes away
      await page.evaluate(() => window.__beep?.teardown()).catch(() => {});
      expect(w.errors, 'console errors').toEqual([]);
      const foreign = w.requests.filter((u) => !/^http:\/\/127\.0\.0\.1:\d+\/(\?.*)?$/.test(u));
      expect(foreign, 'network requests besides the page itself').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/**
 * Open the game with the synthetic camera, press Start like a parent, wait until playing and the
 * motion detector has finished its silent ~1.2 s settle window (so motion counts from here on).
 */
export async function play(page, query = '') {
  await page.goto(`/?synthetic${query}`);
  await page.click('#go');
  await page.waitForFunction(() => window.__beep.state === 'play' && !window.__beep.detector.settling, null, { timeout: 10_000 });
}

export const beep = (page, fn, arg) => page.evaluate(fn, arg);
export const motion = (page, region, amount = 1) => page.evaluate(([r, a]) => window.__beep.synthetic.set(r, a), [region, amount]);
export const sceneState = (page) => page.evaluate(() => window.__beep.sceneState());
export const stats = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__beep.stats)));

export async function holdBothShifts(page, ms = 2200) {
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ShiftRight');
  await page.waitForTimeout(ms);
  await page.keyboard.up('ShiftRight');
  await page.keyboard.up('ShiftLeft');
}
