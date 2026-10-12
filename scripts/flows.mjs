// Gameplay flow checks: stomps, bubbles, knockout/respawn, swimming, whistling, fall damage.
// Usage: node scripts/flows.mjs  (exit code 1 on failure)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

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
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + ' ' + e.stack));
await page.goto('http://localhost:5196/');
await page.waitForFunction(() => window.game && window.game.colossi, null, { timeout: 120000 });
await page.click('#play');
const r = await page.evaluate(() => {
  const g = window.game;
  g.paused = true;
  const step = (secs, held = []) => {
    g.input.keys.clear();
    held.forEach((k) => g.input.keys.add(k));
    for (let i = 0; i < Math.round(secs * 60); i++) { g.paused = false; g.update(1 / 60); g.paused = true; }
    g.input.keys.clear();
  };
  const out = {};
  const put = (x, z) => { g.player.attach = null; g.player.state = 'ground'; g.player.position.set(x, g.terrain.getHeight(x, z), z); g.player.velocity.set(0, 0, 0); };
  // Golem stomp: stand in front of it
  const gol = g.colossi[0];
  const f = gol.root.localToWorld(new g.player.position.constructor(0, 0, 6));
  put(f.x, f.z);
  const h0 = g.player.hearts;
  let stomps = 0;
  for (let i = 0; i < 12 * 60; i++) { g.paused = false; g.update(1 / 60); g.paused = true; if (gol.stomp) stomps++; if (g.player.hearts < h0) break; }
  out.stomp = { hit: g.player.hearts < h0, stompFrames: stomps };
  // Turtle bubbles
  const tur = g.colossi[1];
  const t = tur.root.localToWorld(new g.player.position.constructor(0, 0, 40));
  put(t.x, t.z);
  g.player.invuln = 0;
  const h1 = g.player.hearts;
  let bubbles = 0;
  for (let i = 0; i < 15 * 60; i++) {
    g.paused = false;
    g.update(1 / 60);
    g.paused = true;
    bubbles = Math.max(bubbles, tur.bubbles.length);
    if (g.player.hearts < h1) break;
  }
  out.bubble = { hit: g.player.hearts < h1, maxBubbles: bubbles };
  // KO + respawn
  put(0, 30);
  g.player.lastSafe.set(0, g.terrain.getHeight(0, 30), 30);
  g.player.invuln = 0;
  g.player.damage(10, null);
  out.ko = g.player.state;
  step(3);
  out.afterKo = { state: g.player.state, hearts: g.player.hearts };
  // Swim: walk into lake
  put(-430 + 60, 380);
  g.player.lastSafe.copy(g.player.position);
  g.cameraRig.yaw = Math.atan2(1, 0); // forward = -x toward lake center
  step(8, ['KeyW']);
  out.swim = { state: g.player.state, stamina: Math.round(g.player.stamina) };
  // Whistle
  put(100, 100);
  g.horse.state = 'idle';
  g.input.keys.add('KeyQ');
  step(0.1, ['KeyQ']);
  step(8);
  out.horseDist = Math.round(g.horse.position.distanceTo(g.player.position));
  // Fall damage
  put(0, 30);
  g.player.invuln = 0; g.player.hearts = 5;
  g.player.position.y += 30; g.player.state = 'air';
  step(3);
  out.fall = g.player.hearts;
  return out;
});
console.log(JSON.stringify(r));
const ok =
  !errors.length &&
  r.stomp.hit &&
  r.bubble.hit &&
  r.ko === 'ko' &&
  r.afterKo.state === 'ground' &&
  r.afterKo.hearts === 5 &&
  r.swim.state === 'swim' &&
  r.horseDist < 15 &&
  r.fall < 5;
if (errors.length) console.log(errors.join('\n'));
console.log(ok ? 'FLOWS OK' : 'FLOWS FAILED');
await browser.close();
await server.close();
process.exit(ok ? 0 : 1);
