// Shared test harness for the standalone Overmark app: launches the real Electron app (desktop/main.js,
// desktop/preload.js and the bundled page) and gives tests a small vocabulary to drive and observe it.
// Observations are black-box: window state from the main process, canvases and DOM from the page,
// settings from the page's own storage, and the menu bar menu as built.
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { createRequire } = require('module');
const req = createRequire(path.join(__dirname, '..', '..', 'desktop', 'package.json'));
const { _electron } = req('playwright-core');
const electronPath = req('electron');

const APP_DIR = path.join(__dirname, '..', '..', 'desktop'); // the app folder, so the app reports its own version
const SHOTS = process.env.SHOTS || '';
const CAPTURE_LOG = path.join(os.tmpdir(), 'overmark-screencapture.log');
const state = { app: null, home: fs.mkdtempSync(path.join(os.tmpdir(), 'overmark-e2e-')), results: [], requests: [], suite: '' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m); };
function section(name) { state.suite = name; console.log(`\n── ${name}`); }
async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); state.results.push(['PASS', state.suite, name, note || '']); console.log(`PASS  ${name}${note ? '  (' + note + ')' : ''}  ${Date.now() - t}ms`); }
  catch (e) { state.results.push(['FAIL', state.suite, name, e.message]); console.log(`FAIL  ${name}: ${e.message}`); }
}
async function waitFor(fn, what, ms = 15000) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(120); }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

// ---------------------------------------------------------------- a local stand-in for GitHub Releases
const fake = { releases: [], files: {}, url: '' };
const server = http.createServer((q, r) => {
  if (q.url === '/releases') { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify(fake.releases)); }
  const f = fake.files[q.url]; if (!f) { r.statusCode = 404; return r.end(); }
  r.end(f);
});
function release(tag, { pre = false, tamper = false } = {}) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64', v = tag.replace(/^v/, ''), name = `Overmark-${v}-${arch}-mac.zip`;
  const body = Buffer.from('PK fake zip for ' + tag + ' ' + 'x'.repeat(5000));
  fake.files['/dl/' + tag + '/' + name] = body;
  const sum = tamper ? '0'.repeat(64) : crypto.createHash('sha256').update(body).digest('hex');
  fake.files['/dl/' + tag + '/SHA256SUMS.txt'] = `${sum}  ${name}\n${'1'.repeat(64)}  Overmark-${v}-${arch}.dmg\n`;
  return { tag_name: tag, prerelease: pre, draft: false, html_url: 'https://github.com/thepiyushway/overmark/releases/tag/' + tag,
    assets: [{ name, browser_download_url: fake.url + '/dl/' + tag + '/' + name }, { name: 'SHA256SUMS.txt', browser_download_url: fake.url + '/dl/' + tag + '/SHA256SUMS.txt' }] };
}
async function startServer() { if (!fake.url) { await new Promise((r) => server.listen(0, '127.0.0.1', r)); fake.url = 'http://127.0.0.1:' + server.address().port; } }

// ---------------------------------------------------------------- the app
async function launch({ fresh = false } = {}) {
  await startServer();
  if (fresh) state.home = fs.mkdtempSync(path.join(os.tmpdir(), 'overmark-e2e-'));
  const args = [APP_DIR];
  if (process.platform === 'linux') args.unshift('--no-sandbox'); // CI containers and Ubuntu's AppArmor block Chromium's sandbox; macOS keeps it
  const app = await _electron.launch({ executablePath: electronPath, args,
    env: { ...process.env, HOME: state.home, XDG_CONFIG_HOME: path.join(state.home, '.config'), OVERMARK_TEST: '1', OVERMARK_NO_UPDATE_CHECK: '1', OVERMARK_UPDATE_URL: fake.url + '/releases', OVERMARK_SCREENCAPTURE_LOG: CAPTURE_LOG } });
  app.on('window', (p) => p.on('request', (r) => { if (/^https?:/.test(r.url()) && !r.url().startsWith(fake.url)) state.requests.push(r.url()); }));
  state.app = app;
  return app;
}
const app = () => state.app;
async function quit() { const a = state.app; if (!a) return; const exited = new Promise((r) => a.process().once('exit', r)); await a.evaluate(({ app }) => app.exit(0)).catch(() => {}); await Promise.race([exited, sleep(5000)]); state.app = null; }

// The page that belongs to the app's current window (it is rebuilt when switching Settings ⇄ overlay).
async function page() {
  const id = await state.app.evaluate(() => global.__overmark?.win()?.webContents.id);
  for (const p of state.app.windows()) {
    if (p.isClosed()) continue;
    const pid = await state.app.evaluate(({ BrowserWindow }, u) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === u)?.webContents.id, p.url()).catch(() => null);
    if (pid === id) return p;
  }
  return state.app.windows().filter((p) => !p.isClosed()).at(-1);
}
const hasClass = async (c) => (await page()).evaluate((c) => document.documentElement.classList.contains(c), c);
async function waitMode(m) {
  return waitFor(async () => { const p = await page(); const ok = await p.evaluate((m) => document.documentElement.classList.contains(m) && document.readyState === 'complete', m); return ok && p; }, `mode ${m}`);
}
const winState = () => state.app.evaluate(({ screen }) => { const w = global.__overmark.win(); return { visible: w.isVisible(), focused: w.isFocused(), top: w.isAlwaysOnTop(), bounds: w.getBounds(), work: screen.getPrimaryDisplay().workArea, ignoring: global.__overmark.ignoring() }; });
const send = (channel, arg) => state.app.evaluate(({}, [c, a]) => global.__overmark.win().webContents.send(c, a), [channel, arg]);
const shortcut = (acc) => send('om:shortcut', acc);
const isRegistered = (acc) => state.app.evaluate(({ globalShortcut }, a) => globalShortcut.isRegistered(a), acc);
const menu = () => state.app.evaluate(() => global.__overmark.menu().map((i) => ({ label: i.label, type: i.type, checked: i.checked, enabled: i.enabled !== false })).filter((i) => i.label));
const menuLabels = async () => (await menu()).map((i) => i.label);
const menuItem = async (prefix) => (await menu()).find((i) => i.label.startsWith(prefix));
async function menuClick(label) {
  const ok = await state.app.evaluate(({}, label) => { const it = global.__overmark.menu().find((i) => i.label && i.label.startsWith(label)); if (!it || it.enabled === false) return false; setTimeout(() => it.click(it), 0); return true; }, label);
  assert(ok, `menu item "${label}" not found or disabled`);
  await sleep(250);
}
const upd = (fn) => state.app.evaluate(async ({}, fn) => { const u = global.__overmark.updater; return fn === 'check' ? u.check({ manual: true }) : fn === 'install' ? u.install() : u.getState(); }, fn);

// ---------------------------------------------------------------- drawing and canvases
async function drag(p, pts, { shift = false } = {}) {
  if (shift) await p.keyboard.down('Shift');
  await p.mouse.move(...pts[0]); await p.mouse.down(); for (const q of pts.slice(1)) await p.mouse.move(...q, { steps: 6 }); await p.mouse.up();
  if (shift) await p.keyboard.up('Shift');
  await sleep(150);
}
// Pixels with alpha above a threshold on a canvas (#ink: strokes and whiteboard, #fx: highlight/spotlight/zoom).
const pixels = async (id = 'ink', minAlpha = 20) => (await page()).evaluate(([id, m]) => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > m) n++; return n; }, [id, minAlpha]);
// RGBA at a CSS-pixel point of a canvas.
const pixelAt = async (id, x, y) => (await page()).evaluate(([id, x, y]) => { const c = document.getElementById(id); const k = c.width / c.getBoundingClientRect().width; return [...c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data]; }, [id, x, y]);
// Bounding box (CSS px) of painted pixels in a region, with the dominant opaque colour.
const inkBox = async (id = 'ink', region = null) => (await page()).evaluate(([id, rg]) => {
  const c = document.getElementById(id); const k = c.width / c.getBoundingClientRect().width;
  const [x0, y0, w, h] = rg ? rg.map((v) => Math.round(v * k)) : [0, 0, c.width, c.height];
  const d = c.getContext('2d').getImageData(x0, y0, w, h).data; let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0; const col = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] > 40) { n++; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (d[i + 3] > 200) { const key = [d[i] >> 4, d[i + 1] >> 4, d[i + 2] >> 4].join(','); col[key] = (col[key] || 0) + 1; } } }
  const top = Object.entries(col).sort((a, b) => b[1] - a[1])[0]?.[0]?.split(',').map((v) => v * 16 + 8);
  let maxAlpha = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > maxAlpha) maxAlpha = d[i];
  return n ? { x: (x0 + minX) / k, y: (y0 + minY) / k, w: (maxX - minX + 1) / k, h: (maxY - minY + 1) / k, n, color: top || null, maxAlpha } : { n: 0 };
}, [id, region]);
// A cheap fingerprint of a canvas, to tell whether a setting changed what is drawn.
const canvasHash = async (sel) => (await page()).evaluate((sel) => { const c = document.querySelector(sel); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i += 7) { h ^= d[i]; h = Math.imul(h, 16777619); } let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return { h: h >>> 0, n }; }, sel);
const toolbarShown = async () => (await page()).evaluate(() => { const b = document.getElementById('bar'); const r = b.getBoundingClientRect(); return getComputedStyle(b).display !== 'none' && getComputedStyle(b).visibility !== 'hidden' && r.width > 0 && r.top >= 0 && !document.documentElement.classList.contains('bare'); });
const hudText = async () => (await page()).evaluate(() => { const h = document.getElementById('hud'); return h && h.classList.contains('on') ? h.innerText : ''; });
const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await (await page()).screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {}); } };

// ---------------------------------------------------------------- settings
const stored = async (key) => (await page()).evaluate((k) => { try { return JSON.parse(localStorage.getItem('overmark.' + k)); } catch { return null; } }, key);
async function openTab(id) { const p = await page(); await p.click(`[data-tab="${id}"]`); await sleep(120); return p; }
// Sets a Settings control (select, range, checkbox or colour) the way a person does, and waits for it to be saved.
async function setControl(cfgPath, value) {
  const p = await page();
  await p.evaluate(([cp, v]) => {
    const el = document.querySelector(`[data-cfg="${cp}"]`); if (!el) throw new Error('no control ' + cp);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [cfgPath, value]);
  await waitFor(async () => { const cfg = await stored('cfg'); const got = cfgPath.split('.').reduce((a, k) => a?.[k], cfg); return got !== undefined && String(got) === String(typeof value === 'boolean' ? value : value) && true; }, `saved ${cfgPath}=${value}`, 3000);
}

// ---------------------------------------------------------------- zoom capture stand-in (Linux only)
function captureAvailable() { return fs.existsSync('/usr/sbin/screencapture'); }
function captures() { try { return fs.readFileSync(CAPTURE_LOG, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } }
function resetCaptures() { try { fs.unlinkSync(CAPTURE_LOG); } catch {} }

function finish(label) {
  const failed = state.results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${label}: ${state.results.length - failed.length}/${state.results.length} passed`);
  if (failed.length) console.log(failed.map((f) => `  ✗ [${f[1]}] ${f[2]}: ${f[3]}`).join('\n'));
  if (process.env.RESULTS) fs.writeFileSync(process.env.RESULTS, JSON.stringify(state.results, null, 2));
  server.close();
  return failed.length;
}

module.exports = { state, app, sleep, assert, section, step, waitFor, fake, release, launch, quit, page, hasClass, waitMode, winState, send, shortcut, isRegistered,
  menu, menuLabels, menuItem, menuClick, upd, drag, pixels, pixelAt, inkBox, canvasHash, toolbarShown, hudText, shot, stored, openTab, setControl,
  captureAvailable, captures, resetCaptures, finish };
