import { test, expect, play, motion, sceneState, stats, beep } from './fixtures.mjs';

test('parent start screen → camera → calibration → play', async ({ page }) => {
  await page.goto('/?synthetic&calibSeconds=1');
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#start')).toContainText('開始');
  await expect(page.locator('#start')).toContainText('Start');
  await expect(page.locator('#start')).toContainText('不上傳'); // privacy line, zh
  await expect(page.locator('#start')).toContainText('never recorded'); // privacy line, en
  await page.click('#go');
  await expect(page.locator('#calib')).toBeVisible();
  await expect(page.locator('#calib')).toContainText('保持不動 3 秒');
  await expect(page.locator('#calib')).toContainText('stay still for 3 seconds');
  await page.waitForFunction(() => __beep.state === 'play');
  await expect(page.locator('#calib')).toBeHidden();
  const tracks = await beep(page, () => __beep.tracks());
  expect(tracks.find((t) => t.kind === 'video')?.readyState).toBe('live');
  await expect(page.locator('#mirror')).toBeVisible(); // the little mirror preview
  expect(await beep(page, () => __beep.audio.state)).toBe('running');
});

test('calibration restarts when he moves, but never gets stuck', async ({ page }) => {
  await page.goto('/?synthetic&calibSeconds=0.8');
  await page.click('#go');
  await motion(page, 'all'); // a toddler will not stand still
  await page.waitForFunction(() => __beep.state === 'play', null, { timeout: 12_000 });
});

test('standing still: the car idles, nothing honks', async ({ page }) => {
  await play(page);
  await page.waitForTimeout(3000);
  const s = await stats(page);
  expect(s.waveHonks).toBe(0);
  expect(s.doots).toBe(0);
  const st = await sceneState(page);
  expect(st.speed).toBeLessThan(20);
});

test('big movement makes the car go, within ~100 ms', async ({ page }) => {
  await play(page);
  await page.waitForTimeout(1200); // car has arrived
  const before = await sceneState(page);
  await motion(page, 'all');
  await page.waitForTimeout(1500);
  const after = await sceneState(page);
  expect(after.speed).toBeGreaterThan(600);
  expect(after.dist).toBeGreaterThan(before.dist + 300);
  const s = await stats(page);
  expect(s.latency.moving).not.toBeNull();
  expect(s.latency.moving).toBeLessThan(120);
  // he stops: the car rolls to a stop, gently
  await motion(page, 'none');
  await page.waitForTimeout(3000);
  expect((await sceneState(page)).speed).toBeLessThan(60);
});

test('arms up (top of the frame) honks within ~100 ms', async ({ page }) => {
  await play(page);
  await motion(page, 'top');
  await page.waitForFunction(() => __beep.stats.waveHonks > 0, null, { timeout: 2000 });
  const s = await stats(page);
  expect(s.latency.honk).toBeLessThan(120);
  await page.waitForTimeout(2000);
  const s2 = await stats(page);
  expect(s2.waveHonks).toBeGreaterThanOrEqual(2); // keeps honking while he waves...
  expect(s2.waveHonks).toBeLessThanOrEqual(5); // ...but rate-limited
});

test('moving on the left or right steers the car that way', async ({ page }) => {
  await play(page);
  await page.waitForTimeout(1200);
  const { vw } = await beep(page, () => __beep.view);
  await motion(page, 'left');
  await page.waitForTimeout(1800);
  let st = await sceneState(page);
  expect(st.carDir).toBe(-1);
  expect(st.carX).toBeLessThan(vw / 2);
  await motion(page, 'right');
  await page.waitForTimeout(1800);
  st = await sceneState(page);
  expect(st.carDir).toBe(1);
  expect(st.carX).toBeGreaterThan(vw / 2);
});

test('a clap or shout → "doot doot" and confetti', async ({ page }) => {
  await play(page);
  await page.waitForTimeout(1500); // let the mic noise floor settle
  await beep(page, () => __beep.synthetic.mic(0.4));
  await page.waitForFunction(() => __beep.stats.doots > 0, null, { timeout: 1000 });
  expect((await beep(page, () => __beep.fx)).confetti).toBeGreaterThan(10);
  await beep(page, () => __beep.synthetic.mic(0));
});

test('after a good drive the car honks goodbye and the next car comes', async ({ page }) => {
  await play(page);
  const first = (await sceneState(page)).carType;
  await motion(page, 'all');
  await page.waitForFunction(() => __beep.stats.carsDone > 0, null, { timeout: 25_000 });
  await page.waitForTimeout(300);
  expect((await sceneState(page)).carType).not.toBe(first);
});

test('idle for a while → a car peeks in and asks "beep?"; moving answers it', async ({ page }) => {
  await play(page, '&idleSeconds=1.5');
  await page.waitForFunction(() => __beep.invite === 'wait', null, { timeout: 6000 });
  expect((await stats(page)).invites).toBe(1);
  await motion(page, 'all');
  await page.waitForFunction(() => __beep.invite === 'out' || __beep.invite === 'hidden', null, { timeout: 2000 });
});

test('the real (fake-device) camera path feeds the detector', async ({ page }) => {
  await page.goto('/?calibSeconds=0.5');
  await page.click('#go');
  await page.waitForFunction(() => __beep.state === 'play', null, { timeout: 10_000 });
  const a = (await stats(page)).camFrames;
  await page.waitForTimeout(1000);
  const b = (await stats(page)).camFrames;
  expect(b - a).toBeGreaterThan(10); // ~30 fps camera, only new frames are processed
});

test('no camera at all: the keyboard still plays', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.goto('/');
  await page.click('#go');
  await expect(page.locator('#calib-nocam')).toBeVisible();
  await page.waitForFunction(() => __beep.state === 'play', null, { timeout: 6000 });
  await expect(page.locator('#mirror')).toBeHidden();
  await page.keyboard.press('a');
  await page.waitForFunction(() => __beep.stats.keyHonks > 0);
});

test('reduced motion is respected', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/?synthetic&calibSeconds=0.5');
  expect(await beep(page, () => __beep.reduced)).toBe(true);
  const fx = await beep(page, () => __beep.fx);
  expect(fx.max).toBeLessThan(200);
  await ctx.close();
});

test('if the audio device fails, the game carries on and sound tries to come back', async ({ page }) => {
  await play(page);
  await beep(page, () => __beep.simulateAudioDeviceError());
  await page.keyboard.press('a');
  await page.waitForFunction(() => __beep.audio.recoveries === 1 && !__beep.audio.broken && __beep.audio.state === 'running', null, { timeout: 3000 });
  // a second failure right away does not cause a retry storm
  await beep(page, () => __beep.simulateAudioDeviceError());
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('b');
    await page.waitForTimeout(200);
  }
  expect((await beep(page, () => __beep.audio)).recoveries).toBe(1);
  expect(await beep(page, () => __beep.state)).toBe('play');
  expect((await stats(page)).keyHonks).toBeGreaterThanOrEqual(4);
});
