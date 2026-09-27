import { test, expect, play, motion, stats, beep, holdBothShifts } from './fixtures.mjs';

const MASH = [
  'a', 's', 'd', 'f', 'j', 'k', 'l', ';', 'q', 'w', 'e', 'r', 'z', 'x', 'c', 'v', '1', '2', '0', '=', '-',
  'Space', 'Enter', 'Tab', 'Backspace', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'PageDown', 'PageUp', 'Home', 'End', 'F1', 'F5', 'F11', 'F12',
  'Meta+r', 'Control+r', 'Meta+[', 'Alt+ArrowLeft', 'Meta+ArrowLeft', 'Control+Shift+r', 'Meta+=', 'Meta+-',
  'Control+=', 'Control+-', 'Meta+l', 'Meta+f', 'Meta+p', 'Meta+s', 'Meta+o', 'Control+p', 'Shift+Tab', 'Alt+F4',
];

test('keyboard mashing honks and never leaves or breaks the game', async ({ page, context }) => {
  await play(page);
  const url = page.url();
  const historyLen = await beep(page, () => history.length);
  let navigations = 0;
  page.on('framenavigated', (f) => f === page.mainFrame() && navigations++);
  page.on('dialog', (d) => d.dismiss());
  for (let round = 0; round < 4; round++) {
    for (const k of MASH) await page.keyboard.press(k);
  }
  // a palm on the keyboard: many keys down at once
  for (const k of ['a', 's', 'd', 'f', 'g', 'h']) await page.keyboard.down(k);
  for (const k of ['a', 's', 'd', 'f', 'g', 'h']) await page.keyboard.up(k);
  await page.waitForTimeout(300);
  expect(page.url()).toBe(url);
  expect(navigations).toBe(0);
  expect(context.pages()).toHaveLength(1);
  expect(await beep(page, () => history.length)).toBe(historyLen);
  expect(await beep(page, () => __beep.state)).toBe('play');
  expect(await beep(page, () => __beep.panelOpen)).toBe(false);
  const s = await stats(page);
  expect(s.keyPresses).toBeGreaterThan(MASH.length * 4);
  expect(s.keyHonks).toBeGreaterThan(0);
  // each separate bang is a honk (mashing is rate-limited so it never becomes a wall of noise)
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('j');
    await page.waitForTimeout(250);
  }
  expect((await stats(page)).keyHonks).toBeGreaterThanOrEqual(s.keyHonks + 3);
});

test('context menu, zoom-wheel and back-navigation are blocked', async ({ page }) => {
  await play(page);
  const prevented = await page.evaluate(() => {
    const r = {};
    const ev = (e) => {
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    r.contextmenu = ev(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    r.wheel = ev(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 }));
    r.key = ev(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', metaKey: true, bubbles: true, cancelable: true }));
    return r;
  });
  expect(prevented).toEqual({ contextmenu: true, wheel: true, key: true });
  const url = page.url();
  await page.goBack().catch(() => {});
  await page.waitForTimeout(300);
  expect(page.url()).toBe(url);
  expect(await beep(page, () => __beep.state)).toBe('play');
});

test('parent menu: both Shift keys for 2 s — and not by accident', async ({ page }) => {
  await play(page);
  // short both-Shift press: nothing
  await holdBothShifts(page, 800);
  await page.waitForTimeout(200);
  expect(await beep(page, () => __beep.panelOpen)).toBe(false);
  // one Shift held a long time: nothing
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ShiftLeft');
  expect(await beep(page, () => __beep.panelOpen)).toBe(false);
  // both Shifts for 2 s: menu
  await holdBothShifts(page, 2200);
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#panel')).toContainText('家長控制');
  await expect(page.locator('#panel')).toContainText('Parent controls');
  // session clock pauses while the menu is open
  const e1 = (await beep(page, () => __beep.session)).elapsed;
  await page.waitForTimeout(800);
  expect((await beep(page, () => __beep.session)).elapsed).toBeCloseTo(e1, 5);
});

test('parent menu controls: scene, sensitivity, mute, mirror, session length, resume, end', async ({ page }) => {
  await play(page);
  await holdBothShifts(page);
  await expect(page.locator('#panel')).toBeVisible();

  await page.click('[data-sens="high"]');
  expect((await beep(page, () => __beep.detector)).sensitivity).toBe('high');
  await page.click('[data-sens="low"]');
  expect((await beep(page, () => __beep.detector)).sensitivity).toBe('low');

  await page.click('#mute');
  expect((await beep(page, () => __beep.audio)).gain).toBe(0);
  await page.click('#mute');
  expect((await beep(page, () => __beep.audio)).gain).toBeGreaterThan(0);
  expect((await beep(page, () => __beep.audio)).gain).toBeLessThanOrEqual(0.55); // volume cap

  await page.fill('#volume', '100');
  expect((await beep(page, () => __beep.audio)).gain).toBeLessThanOrEqual(0.55);

  await page.click('#mirror-toggle');
  await expect(page.locator('#mirror')).toBeHidden();
  await page.click('#mirror-toggle');
  await expect(page.locator('#mirror')).toBeVisible();

  await page.click('[data-min="10"]');
  expect((await beep(page, () => __beep.session)).duration).toBe(600);

  await page.click('[data-scene="wash"]');
  await expect(page.locator('#panel')).toBeHidden();
  expect(await beep(page, () => __beep.scene)).toBe('wash');

  // Escape closes the menu
  await holdBothShifts(page);
  await expect(page.locator('#panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeHidden();

  // settings are remembered on this computer
  expect((await beep(page, () => __beep.settings)).sensitivity).toBe('low');

  await holdBothShifts(page);
  await page.click('#end');
  await page.waitForFunction(() => __beep.state === 'sleep');
});

test('the parent can also long-press the top-left corner for the menu', async ({ page }) => {
  await play(page);
  await page.mouse.move(20, 20);
  await page.mouse.down();
  await page.waitForTimeout(2300);
  await page.mouse.up();
  await expect(page.locator('#panel')).toBeVisible();
});

test('session ends gently: cars go to sleep and the camera really stops', async ({ page }) => {
  await play(page, '&sessionSeconds=3');
  await motion(page, 'all');
  await page.waitForFunction(() => __beep.state === 'sleep', null, { timeout: 8000 });
  await expect(page.locator('#sleep-card')).toBeVisible();
  await expect(page.locator('#sleep-card')).toContainText('車車回家睡覺囉');
  await expect(page.locator('#sleep-card')).toContainText('going home to sleep');
  expect(await beep(page, () => __beep.scene)).toBe('sleep');
  const tracks = await beep(page, () => __beep.tracks());
  expect(tracks.length).toBeGreaterThan(0);
  expect(tracks.every((t) => t.readyState === 'ended')).toBe(true);
  expect(await beep(page, () => __beep.videoAttached())).toBe(false);
  await expect(page.locator('#mirror')).toBeHidden();
  // nothing the child does wakes the cars up again
  const h = (await stats(page)).honks;
  await page.keyboard.press('a');
  await page.waitForTimeout(300);
  expect((await stats(page)).honks).toBe(h);
});

test('privacy: the page makes zero network requests and is not allowed to', async ({ page, watch }) => {
  await play(page);
  await motion(page, 'all');
  for (const name of ['garage', 'wash', 'light', 'road']) {
    await beep(page, (n) => __beep.setScene(n), name);
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('a');
  await beep(page, () => __beep.endSession());
  await page.waitForTimeout(1000);
  expect(watch.requests).toHaveLength(1); // just the page itself
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src 'none'");
  // and the policy really blocks an attempt (the violation is reported, not logged as an error)
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  // the blocked attempt above logs a CSP console error by design; clear it for the auto-check
  watch.errors = watch.errors.filter((e) => !/Content Security Policy|Failed to fetch/.test(e));
  expect(watch.requests).toHaveLength(1);
});

test('frame budget: a busy scene holds ~60 fps without dropped frames', async ({ page }) => {
  await play(page, '&scene=wash');
  await motion(page, 'all');
  await page.waitForTimeout(1000);
  const f0 = (await stats(page)).frames;
  await beep(page, () => {
    __beep.frameWork.splice(0);
    __beep.frameGaps.splice(0);
  });
  await page.waitForTimeout(3000);
  const f1 = (await stats(page)).frames;
  const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
  const work = await beep(page, () => __beep.frameWork.slice());
  const gaps = await beep(page, () => __beep.frameGaps.slice());
  const fps = (f1 - f0) / 3;
  console.log(`fps ${fps.toFixed(0)}, frame interval p50 ${pct(gaps, 0.5).toFixed(1)} / p95 ${pct(gaps, 0.95).toFixed(1)} ms, JS work p95 ${pct(work, 0.95).toFixed(2)} ms`);
  expect(fps).toBeGreaterThan(50);
  expect(pct(gaps, 0.95)).toBeLessThan(25); // at most the odd late frame
  expect(pct(work, 0.95)).toBeLessThan(8); // update + draw calls leave most of the 16.7 ms budget free
});
