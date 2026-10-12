// Headless smoke test: boots the game, steps the simulation deterministically and saves
// screenshots of key moments. Fails (exit 1) on page errors or broken gameplay invariants.
// Usage: node scripts/smoke.mjs [outDir]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || 'screenshots';
fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base)) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto('http://localhost:5199/');
await page.waitForFunction(() => window.game && window.game.colossi, null, { timeout: 120000 });
await page.click('#play');
await page.evaluate(() => {
  const g = window.game;
  g.paused = true;
  g.hud.bannerTimer = 0.01;
  window.step = (secs, held = []) => {
    g.input.keys.clear();
    held.forEach((k) => g.input.keys.add(k));
    for (let i = 0; i < Math.round(secs * 60); i++) {
      g.paused = false;
      g.update(1 / 60);
      g.paused = true;
    }
    g.input.keys.clear();
  };
});
// The real-time loop keeps rendering while paused; wait for fresh frames before each shot.
const shot = async (name) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${outDir}/${name}.png` });
};
const results = {};

await page.evaluate(() => window.step(0.5));
await shot('01-shrine');

results.horse = await page.evaluate(() => {
  const g = window.game;
  g.player.position.copy(g.horse.position).add({ x: 1.5, y: 0, z: 0 });
  window.step(0.1, ['KeyE']);
  const mounted = g.player.state === 'mounted';
  g.cameraRig.yaw = Math.PI;
  window.step(3, ['KeyW', 'ShiftLeft']);
  return { mounted, speed: +g.horse.speed.toFixed(1) };
});
await shot('02-gallop');

for (const [i, name] of [[0, '03-golem'], [1, '04-turtle']]) {
  await page.evaluate((i) => {
    const g = window.game;
    if (g.player.state === 'mounted') g.player.dismount();
    const c = g.colossi[i];
    const x = c.root.position.x + 34;
    const z = c.root.position.z + 34;
    g.player.position.set(x, g.terrain.getHeight(x, z), z);
    g.player.state = 'ground';
    g.player.velocity.set(0, 0, 0);
    g.cameraRig.yaw = Math.atan2(34, 34);
    g.cameraRig.pitch = 0.05;
    g.cameraRig.snap(g.player.position);
    window.step(0.6);
  }, i);
  await shot(name);
}

// Climb the golem from its calf and look at the back crystal.
results.climb = await page.evaluate(() => {
  const g = window.game;
  const c = g.colossi[0];
  const V = g.player.position.constructor;
  c.root.updateMatrixWorld(true);
  const knee = c.legs[0].knee;
  const from = knee.localToWorld(new V(0, -2.0, -4));
  const hit = g.player.ray(c, from, knee.localToWorld(new V(0, -2.0, 0)).sub(from).normalize(), 5);
  g.player.attachTo(c, hit);
  g.cameraRig.yaw = c.heading + Math.PI;
  g.cameraRig.snap(g.player.position);
  const y0 = g.player.position.y;
  window.step(4.5, ['KeyW', 'KeyF']);
  return { state: g.player.state, climbed: +(g.player.position.y - y0).toFixed(1), near: g.player.nearWeakPoint?.label ?? null };
});
await shot('05-climbing');

results.free = await page.evaluate(() => {
  const g = window.game;
  for (const c of g.colossi) for (const wp of c.weakPoints) c.hitWeakPoint(wp, 999, 1);
  window.step(3);
  return g.colossi.map((c) => c.freed);
});
await shot('06-freed');

console.log(JSON.stringify(results, null, 2));
const ok =
  errors.length === 0 &&
  results.horse.mounted &&
  results.horse.speed > 12 &&
  results.climb.state === 'climb' &&
  results.climb.climbed > 4 &&
  results.free.every(Boolean);
console.log(errors.length ? errors.join('\n') : 'no page errors');
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
await browser.close();
await server.close();
process.exit(ok ? 0 : 1);
