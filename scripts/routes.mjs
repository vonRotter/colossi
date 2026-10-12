// Climbing route test: plays each guardian with scripted input (no rendering needed)
// and checks every crystal can be reached by climbing. Exit code 1 on failure.
// Usage: node scripts/routes.mjs
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

const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5198/');
await page.waitForFunction(() => window.game && window.game.colossi, null, { timeout: 120000 });
await page.click('#play');

const result = await page.evaluate(() => {
  const g = window.game;
  g.paused = true;
  const V = g.player.position.constructor;
  const seen = new Set();
  // Hold keys for `secs`, optionally steering the camera so "forward" points at a target.
  const run = (secs, held, target) => {
    g.input.keys.clear();
    held.forEach((k) => g.input.keys.add(k));
    for (let i = 0; i < Math.round(secs * 60); i++) {
      if (target) {
        const t = target.isObject3D ? target.getWorldPosition(new V()) : target();
        g.cameraRig.yaw = Math.atan2(-(t.x - g.player.position.x), -(t.z - g.player.position.z));
      }
      g.paused = false;
      g.update(1 / 60);
      g.paused = true;
      if (g.player.nearWeakPoint) seen.add(g.player.nearWeakPoint.label);
    }
    g.input.keys.clear();
  };
  // Keep the guardian still so the script can steer, but keep it animating.
  const freeze = (c) => {
    c.root.rotation.y = c.heading;
    c.root.updateMatrixWorld(true);
    c.update = (dt) => {
      c.animate(dt);
      c.updateCommon(dt);
    };
  };
  const local = (c, x, y, z) => () => c.root.localToWorld(new V(x, y, z));
  const out = {};

  // Bramblestone: calf -> thigh -> belt -> back -> shoulders -> head
  {
    const c = g.colossi[0];
    freeze(c);
    const knee = c.legs[0].knee;
    const from = knee.localToWorld(new V(0, -2.0, -4));
    const hit = g.player.ray(c, from, knee.localToWorld(new V(0, -2.0, 0)).sub(from).normalize(), 5);
    g.player.attachTo(c, hit);
    g.cameraRig.yaw = c.heading + Math.PI;
    seen.clear();
    run(6.5, ['KeyW', 'KeyF']); // up the back of the leg to the shoulders
    run(2, ['KeyW'], local(c, 0, 0, -2.8)); // walk behind the head
    run(5, ['KeyW', 'KeyF'], local(c, 0, 0, 6)); // grab the mossy back of the head
    out.golem = { seen: [...seen], state: g.player.state };
  }

  // Mossback: tail ramp -> shell -> neck -> head
  {
    const c = g.colossi[1];
    freeze(c);
    const p = c.root.localToWorld(new V(0, 0, -28));
    g.player.attach = null;
    g.player.state = 'ground';
    g.player.position.set(p.x, g.terrain.getHeight(p.x, p.z), p.z);
    g.player.velocity.set(0, 0, 0);
    g.player.stamina = 100;
    seen.clear();
    run(10, ['KeyW'], c.tail1);
    run(6, ['KeyW', 'KeyF'], local(c, 0, 0, 0));
    run(3, ['KeyW'], local(c, 0, 12, -1.5));
    const wp = g.player.nearWeakPoint;
    const hpBefore = wp ? wp.hp : 0;
    if (wp) {
      g.input.mouse.add(0);
      run(1.2, []);
      g.input.mouse.add(0);
      g.input.mouse.delete(0);
      run(0.1, []);
    }
    const damage = wp ? hpBefore - wp.hp : 0;
    run(3, ['KeyW', 'KeyF'], local(c, 0, 8, 22));
    run(6, ['KeyW', 'KeyF'], local(c, 0, 8, 26));
    out.turtle = { seen: [...seen], damage: Math.round(damage) };
  }
  return out;
});

console.log(JSON.stringify(result));
const ok =
  errors.length === 0 &&
  ['calf', 'back', 'head'].filter((l) => result.golem.seen.includes(l)).length >= 2 &&
  result.golem.seen.includes('head') &&
  result.turtle.seen.includes('shell') &&
  result.turtle.seen.includes('head') &&
  result.turtle.damage > 30;
if (errors.length) console.log(errors.join('\n'));
console.log(ok ? 'ROUTES OK' : 'ROUTES FAILED');
await browser.close();
await server.close();
process.exit(ok ? 0 : 1);
