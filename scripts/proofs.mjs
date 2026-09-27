// Screenshots of every scene and every car, in headless Chromium with a fake camera and the
// synthetic motion source. Output: proofs/*.png (gitignored). Run `npm run build` first.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'proofs');
const port = Number(process.env.PORT || 4179);
const base = `http://127.0.0.1:${port}/`;
await mkdir(out, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));

const ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const errors = [];
const shots = [];

// A fresh browser per page: Chromium's audio service is shared across pages and is flaky on
// headless hosts for the second page that plays sound.
async function open(query = '', opts = {}) {
  const browser = await chromium.launch({ args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.close = async () => browser.close();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(query + ': ' + m.text()));
  await page.goto(base + '?synthetic&settleSeconds=0.6' + query);
  return page;
}
async function shot(page, name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
}
const wait = (page, ms) => page.waitForTimeout(ms);
const motion = (page, r, a = 1) => page.evaluate(([r, a]) => __beep.synthetic.set(r, a), [r, a]);
async function play(page) {
  await page.click('#go');
  await wait(page, 350);
  await page.waitForFunction(() => __beep.state === 'play');
}

try {
  // start, then playing at once
  let page = await open('');
  await wait(page, 700);
  await shot(page, '01-start');
  await page.click('#go');
  await wait(page, 600);
  await shot(page, '02-playing-at-once');
  await page.close();

  // road
  page = await open('&scene=road');
  await play(page);
  await wait(page, 900);
  await shot(page, '03-road-still');
  await motion(page, 'all');
  await wait(page, 1500);
  await shot(page, '04-road-moving');
  await motion(page, 'top');
  await wait(page, 250);
  await shot(page, '05-road-honk');
  await motion(page, 'left');
  await wait(page, 1600);
  await shot(page, '06-road-steer-left');
  await motion(page, 'none');
  await page.evaluate(() => __beep.synthetic.mic(0.5));
  await wait(page, 300);
  await page.evaluate(() => __beep.synthetic.mic(0));
  await wait(page, 150);
  await shot(page, '07-clap-confetti');
  await page.close();

  // garage
  page = await open('&scene=garage');
  await play(page);
  await wait(page, 800);
  await shot(page, '08-garage-closed');
  await motion(page, 'right');
  await wait(page, 700);
  await shot(page, '09-garage-peeking');
  await page.waitForFunction(() => __beep.stats.garageOpens > 0, null, { timeout: 8000 });
  await wait(page, 700);
  await shot(page, '10-garage-peekaboo');
  await page.close();

  // wash
  page = await open('&scene=wash');
  await play(page);
  await wait(page, 1500);
  await shot(page, '11-wash-muddy');
  await motion(page, 'all');
  await wait(page, 2500);
  await shot(page, '12-wash-bubbles');
  await page.waitForFunction(() => __beep.stats.washes > 0, null, { timeout: 15000 });
  await motion(page, 'none');
  await wait(page, 500);
  await shot(page, '13-wash-sparkle-clean');
  await page.close();

  // traffic light
  page = await open('&scene=light');
  await play(page);
  await wait(page, 2000);
  await shot(page, '14-light-red-queue');
  await motion(page, 'all');
  await wait(page, 900);
  await shot(page, '15-light-green-go');
  await page.close();

  // idle invitation
  page = await open('&scene=road&idleSeconds=1.5');
  await play(page);
  await page.waitForFunction(() => __beep.invite === 'wait', null, { timeout: 8000 });
  await wait(page, 200);
  await shot(page, '16-idle-invite-beep');
  // parent panel
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ShiftRight');
  await wait(page, 2200);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('ShiftRight');
  await shot(page, '17-parent-panel');
  await page.close();

  // bedtime
  page = await open('&scene=road&sessionSeconds=5');
  await play(page);
  await page.waitForFunction(() => __beep.state === 'sleep', null, { timeout: 12000 });
  await wait(page, 2500);
  await shot(page, '18-sleep-going-home');
  await wait(page, 7000);
  await shot(page, '19-sleep-night');
  await page.close();

  // every car
  page = await open('&scene=gallery');
  await wait(page, 700);
  await page.evaluate(() => document.getElementById('start').setAttribute('hidden', ''));
  await wait(page, 300);
  await shot(page, '20-all-cars');
  await page.close();

  // reduced motion
  page = await open('&scene=road', { reducedMotion: 'reduce' });
  await play(page);
  await motion(page, 'all');
  await wait(page, 1200);
  await shot(page, '21-reduced-motion');
  await page.close();
} finally {
  server.kill();
}

console.log(shots.map((s) => path.relative(root, s)).join('\n'));
if (errors.length) {
  console.error('page errors:', errors);
  process.exit(1);
}
