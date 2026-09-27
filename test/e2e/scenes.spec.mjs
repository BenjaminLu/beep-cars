import { test, expect, play, motion, sceneState, stats, beep } from './fixtures.mjs';

/** The canvas is really painted: sample it and demand plenty of different colours. */
async function canvasIsRich(page) {
  await page.waitForTimeout(700); // past the scene cross-fade
  return page.evaluate(() => {
    const c = document.getElementById('stage');
    const small = document.createElement('canvas');
    small.width = 64;
    small.height = 36;
    const x = small.getContext('2d');
    x.drawImage(c, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data;
    const colours = new Set();
    for (let i = 0; i < d.length; i += 4) colours.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return colours.size;
  });
}

test('Road scene renders and reacts', async ({ page }) => {
  await play(page, '&scene=road');
  expect(await beep(page, () => __beep.scene)).toBe('road');
  expect(await canvasIsRich(page)).toBeGreaterThan(40);
  await motion(page, 'all');
  await page.waitForTimeout(1200);
  expect((await sceneState(page)).speed).toBeGreaterThan(500);
});

test('Garage peekaboo: moving rolls the door up and a car pops out', async ({ page }) => {
  await play(page, '&scene=garage');
  expect(await beep(page, () => __beep.scene)).toBe('garage');
  expect(await canvasIsRich(page)).toBeGreaterThan(40);
  await page.waitForTimeout(1500);
  expect((await sceneState(page)).doors).toEqual([0, 0, 0]);
  await motion(page, 'right');
  await page.waitForTimeout(600);
  const st = await sceneState(page);
  expect(st.sel).toBe(2); // the garage on the side he moves on
  expect(st.doors[2]).toBeGreaterThan(0.1);
  await page.waitForFunction(() => __beep.stats.garageOpens > 0, null, { timeout: 6000 });
});

test('Car wash: moving makes bubbles and washes the mud off', async ({ page }) => {
  await play(page, '&scene=wash');
  expect(await beep(page, () => __beep.scene)).toBe('wash');
  expect(await canvasIsRich(page)).toBeGreaterThan(40);
  await page.waitForFunction(() => __beep.sceneState().phase === 'wash', null, { timeout: 6000 });
  await motion(page, 'all');
  await page.waitForTimeout(1200);
  expect((await beep(page, () => __beep.fx)).bubbles).toBeGreaterThan(5);
  expect((await sceneState(page)).clean).toBeGreaterThan(0.1);
  await page.waitForFunction(() => __beep.stats.washes > 0, null, { timeout: 10_000 });
});

test('Traffic light: movement turns it green and the cars go; stillness turns it red again', async ({ page }) => {
  await play(page, '&scene=light');
  expect(await beep(page, () => __beep.scene)).toBe('light');
  expect(await canvasIsRich(page)).toBeGreaterThan(40);
  await page.waitForTimeout(2500);
  let st = await sceneState(page);
  expect(st.light).toBe('red');
  expect(Math.max(...st.carsVx)).toBeLessThan(400); // queued / arriving, not racing
  await motion(page, 'all');
  await page.waitForFunction(() => __beep.sceneState().light === 'green', null, { timeout: 1000 });
  await page.waitForTimeout(1200);
  st = await sceneState(page);
  expect(Math.max(...st.carsVx)).toBeGreaterThan(500);
  await motion(page, 'none');
  await page.waitForFunction(() => __beep.sceneState().light === 'red', null, { timeout: 6000 });
});

test('every scene keeps honking back when he raises his arms', async ({ page }) => {
  await play(page);
  for (const name of ['road', 'garage', 'wash', 'light']) {
    await beep(page, (n) => __beep.setScene(n), name);
    await page.waitForTimeout(300);
    const before = (await stats(page)).waveHonks;
    await motion(page, 'top');
    await page.waitForFunction((b) => __beep.stats.waveHonks > b, before, { timeout: 2000 });
    await motion(page, 'none');
    await page.waitForTimeout(900);
  }
});
