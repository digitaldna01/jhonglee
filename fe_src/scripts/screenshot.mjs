#!/usr/bin/env node
/* Screenshot (or probe) a page at a real viewport, via CDP device emulation.
 *
 *   node scripts/screenshot.mjs <url> <out.png> [options]
 *     --width N     viewport width  (default 390 — an iPhone; <600 implies mobile)
 *     --height N    viewport height (default 844)
 *     --desktop     mobile=false emulation (default when width >= 600)
 *     --scroll      scroll to the bottom before shooting
 *     --click SEL   click the first match, wait a beat, then shoot
 *     --eval EXPR   evaluate EXPR in the page and print the JSON result
 *     --wait MS     settle time after load / click (default 3500 / 1000)
 *
 * Why not `chrome --screenshot --window-size=390,…`: headless Chrome silently
 * floors the window width at ~500px and CROPS the shot, which looks exactly
 * like a right-edge overflow bug. Only Emulation.setDeviceMetricsOverride
 * renders a true narrow viewport. Prints scrollWidth × innerWidth so a real
 * overflow is a number, not an impression.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const [url, out] = args;
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
if (!url || !out) {
  console.error('usage: node scripts/screenshot.mjs <url> <out.png> [--width N] [--height N] [--desktop] [--scroll] [--click SEL] [--eval EXPR] [--wait MS]');
  process.exit(2);
}
const width = +opt('width', 390);
const height = +opt('height', 844);
const mobile = has('desktop') ? false : width < 600;
const settle = +opt('wait', 3500);

const CHROME =
  process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9222 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'shot-profile-'));
const chrome = spawn(
  CHROME,
  [`--headless=new`, `--disable-gpu`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);
const die = (code) => { chrome.kill(); process.exit(code); };

try {
  let target;
  for (let i = 0; i < 30; i++) {
    try {
      target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      break;
    } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!target) { console.error('chrome did not come up'); die(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const send = (method, params = {}) =>
    new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evl = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value;

  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
  await send('Page.enable');
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, settle));

  const click = opt('click', null);
  if (click) {
    await evl(`document.querySelector(${JSON.stringify(click)})?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }))`);
    await new Promise((r) => setTimeout(r, +opt('wait', 1000)));
  }
  if (has('scroll')) {
    await evl('window.scrollTo(0, document.documentElement.scrollHeight)');
    await new Promise((r) => setTimeout(r, 600));
  }
  const expr = opt('eval', null);
  if (expr) console.log('eval:', JSON.stringify(await evl(expr)));
  console.log('overflow check: scrollWidth', await evl('document.documentElement.scrollWidth'), '· innerWidth', await evl('window.innerWidth'));

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out, `(${width}×${height}${mobile ? ' mobile' : ''})`);
  die(0);
} catch (e) {
  console.error(e.message);
  die(1);
}
