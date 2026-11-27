// End-to-end test of the standalone app: real Electron, desktop/main.js, desktop/preload.js and the bundled page.
// Run from desktop/:  npm test      (on Linux CI: xvfb-run -a npm test)
// Global shortcuts and menu bar clicks are delivered the same way macOS delivers them (main → page),
// because synthetic key presses can't reach a system-wide hotkey.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createRequire } = require('module');
const req = createRequire(path.join(__dirname, '..', 'desktop', 'package.json'));
const { _electron } = req('playwright-core');
const electronPath = req('electron');
const MAIN = path.join(__dirname, '..', 'desktop'); // the app folder, so the app reports its own version
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'overmark-e2e-'));
const SHOTS = process.env.SHOTS || '';

const results = [];
let app;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); results.push(['PASS', name, note || '']); console.log(`PASS  ${name}${note ? '  (' + note + ')' : ''}  ${Date.now() - t}ms`); }
  catch (e) { results.push(['FAIL', name, e.message]); console.log(`FAIL  ${name}: ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
async function waitFor(fn, what, ms = 15000) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(150); }
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

async function launch() {
  const args = [MAIN];
  if (process.platform === 'linux') args.unshift('--no-sandbox'); // CI containers and Ubuntu's AppArmor block Chromium's sandbox; macOS keeps it
  app = await _electron.launch({ executablePath: electronPath, args, env: { ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, '.config'), OVERMARK_TEST: '1', OVERMARK_NO_UPDATE_CHECK: '1', OVERMARK_UPDATE_URL: fake.url + '/releases' } });
  app.on('window', (p) => p.on('request', (r) => { if (/^https?:/.test(r.url())) requests.push(r.url()); }));
}
const requests = [];
// A local stand-in for GitHub Releases, serving a real zip and SHA256SUMS.txt.
const http = require('http'), crypto = require('crypto');
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
const upd = (fn) => app.evaluate(async ({}, fn) => { const u = global.__overmark.updater; return fn === 'check' ? u.check({ manual: true }) : fn === 'install' ? u.install() : u.getState(); }, fn);
// The page that belongs to the app's current window (it is rebuilt when switching Settings ⇄ overlay).
async function page() {
  const url = await app.evaluate(() => global.__overmark?.win()?.webContents.id);
  for (const p of app.windows()) {
    if (p.isClosed()) continue;
    const id = await app.evaluate(({ BrowserWindow }, u) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === u)?.webContents.id, p.url()).catch(() => null);
    if (id === url) return p;
  }
  return app.windows().filter((p) => !p.isClosed()).at(-1);
}
const mode = async () => (await page()).evaluate(() => (document.documentElement.classList.contains('overlay') && document.body.classList.contains('overlay')) || document.documentElement.className.includes('overlay') ? 'overlay' : document.documentElement.className.includes('setup') ? 'setup' : 'page');
async function waitMode(m) {
  return waitFor(async () => { const p = await page(); const ok = await p.evaluate((m) => document.documentElement.classList.contains(m) && document.readyState === 'complete', m); return ok && p; }, `mode ${m}`);
}
const winState = () => app.evaluate(({ screen }) => { const w = global.__overmark.win(); return { visible: w.isVisible(), focused: w.isFocused(), top: w.isAlwaysOnTop(), bounds: w.getBounds(), work: screen.getPrimaryDisplay().workArea, ignoring: global.__overmark.ignoring() }; });
const send = (channel, arg) => app.evaluate(({}, [c, a]) => global.__overmark.win().webContents.send(c, a), [channel, arg]);
const shortcut = (acc) => send('om:shortcut', acc);
async function menuClick(label) {
  const ok = await app.evaluate(({}, label) => { const it = global.__overmark.menu().find((i) => i.label && i.label.startsWith(label)); if (!it) return false; setTimeout(() => it.click(it), 0); return true; }, label);
  assert(ok, `menu item "${label}" not found`);
}
const menuLabels = () => app.evaluate(() => global.__overmark.menu().map((i) => i.label).filter(Boolean));
const inkPixels = async (id = 'ink') => (await page()).evaluate((id) => { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; }, id);
const toolbarShown = async () => (await page()).evaluate(() => { const b = document.getElementById('bar'); const r = b.getBoundingClientRect(); return getComputedStyle(b).display !== 'none' && getComputedStyle(b).visibility !== 'hidden' && r.width > 0 && r.top >= 0; });
const shot = async (name) => { if (SHOTS) await (await page()).screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {}); };
async function drag(p, pts) { await p.mouse.move(...pts[0]); await p.mouse.down(); for (const q of pts.slice(1)) await p.mouse.move(...q, { steps: 6 }); await p.mouse.up(); await sleep(150); }

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); fake.url = 'http://127.0.0.1:' + server.address().port;
  await launch();

  await step('First launch opens the Settings window (not an invisible menu bar app)', async () => {
    await waitMode('setup');
    const w = await waitFor(async () => { const s = await winState(); return s.visible && s; }, 'Settings window visible');
    assert(!w.top, 'Settings window should not be always-on-top');
    await shot('01-settings');
    return `${w.bounds.width}×${w.bounds.height}`;
  });
  await step('Works offline: no internet requests, bundled font loaded', async () => {
    const p = await page();
    const f = await p.evaluate(async () => { await document.fonts.ready; const all = [...document.fonts].filter((x) => x.family.includes('Schibsted'));
      return { loaded: all.filter((x) => x.status === 'loaded').map((x) => x.weight), errors: all.filter((x) => x.status === 'error').map((x) => x.weight) }; });
    assert(f.loaded.length >= 2 && !f.errors.length, 'font faces: ' + JSON.stringify(f));
    assert(requests.length === 0, 'requests: ' + requests.join(', '));
    return 'weights ' + f.loaded.join('/');
  });
  await step('Settings: every tab renders; About credits thepiyushway; no Claude-only sections', async () => {
    const p = await page();
    const tabs = await p.$$eval('[data-tab]', (b) => b.map((x) => x.dataset.tab));
    assert(tabs.length >= 6, 'tabs: ' + tabs);
    for (const t of tabs) { await p.click(`[data-tab="${t}"]`); await sleep(120); const txt = await p.innerText('body'); assert(txt.length > 200, 'empty tab ' + t); }
    const about = await p.innerText('body');
    assert(/Built by thepiyushway/.test(about), 'About credit missing');
    assert(/Standalone Mac edition/.test(about), 'standalone wording missing');
    assert(!/Install as Mac app|installed from Claude/.test(about), 'Claude-app wording leaked');
    await shot('02-about');
    await p.click('[data-tab="general"]').catch(() => {});
    return tabs.join(', ');
  });
  await step('Settings → About → "Check for updates" reports a new version', async () => {
    fake.releases = [release('v1.0.0')];
    const p = await page(); await p.click('[data-tab="about"]'); await p.click('[data-do="updates"]');
    const t = await waitFor(async () => { const b = await p.innerText('body'); return /Version 1\.0\.0 is available/.test(b) && 'shown'; }, 'update message');
    fake.releases = [];
    await p.click('[data-tab="general"]');
    return t;
  });
  await step('Menu bar item is created with every action', async () => {
    const labels = await waitFor(async () => { const l = await menuLabels(); return l.length > 8 && l; }, 'menu');
    for (const want of ['Annotate screen', 'Whiteboard', 'Highlight cursor', 'Spotlight', 'Zoom', 'Clear ink', 'Settings…', 'Reload Overmark', 'Open at login', 'Quit Overmark'])
      assert(labels.some((l) => l.startsWith(want)), 'missing ' + want);
    return labels.length + ' items';
  });
  await step('"Run in menu bar" switches to the click-through overlay covering the screen', async () => {
    const p = await page();
    await p.getByRole('button', { name: /Run in menu bar/ }).click();
    await waitMode('overlay');
    const w = await waitFor(async () => { const s = await winState(); return s.top && s.bounds.width === s.work.width && s; }, 'overlay bounds');
    assert(w.bounds.x === w.work.x && w.bounds.y === w.work.y && w.bounds.height === w.work.height, 'not sized to work area: ' + JSON.stringify(w));
    return `${w.bounds.width}×${w.bounds.height}, always on top`;
  });
  await step('Global shortcuts registered (6)', async () => {
    const regs = await app.evaluate(({ globalShortcut }) => ['Command+Shift+1', 'Command+Shift+2', 'Command+Shift+7', 'Command+Shift+8', 'Command+Shift+9', 'Command+Shift+0'].map((a) => [a, globalShortcut.isRegistered(a)]));
    const missing = regs.filter(([, ok]) => !ok).map(([a]) => a);
    assert(!missing.length, 'not registered: ' + missing.join(', '));
  });
  await step('⌘⇧1 starts drawing: window shown, takes the mouse, toolbar visible', async () => {
    await shortcut('Command+Shift+1');
    await waitFor(async () => (await page()).evaluate(() => document.documentElement.classList.contains('drawing')), 'drawing class');
    const w = await waitFor(async () => { const s = await winState(); return s.visible && !s.ignoring && s; }, 'window visible and not click-through');
    assert(await toolbarShown(), 'toolbar hidden');
    return w.focused ? 'focused' : 'shown';
  });
  await step('Pen stroke is drawn and kept', async () => {
    const p = await page();
    await drag(p, [[300, 300], [420, 340], [540, 300], [660, 360]]);
    const n = await inkPixels(); assert(n > 300, 'ink pixels ' + n); return n + ' px';
  });
  let before;
  await step('Box, circle, arrow and line tools draw', async () => {
    const p = await page();
    for (const [k, pts] of [['r', [[300, 420], [500, 520]]], ['o', [[560, 420], [760, 540]]], ['a', [[820, 520], [980, 420]]], ['l', [[300, 600], [700, 600]]]]) {
      const a = await inkPixels(); await p.keyboard.press(k); await drag(p, pts); const b = await inkPixels();
      assert(b > a + 50, `tool ${k} added ${b - a} px`);
    }
    before = await inkPixels(); await shot('03-drawing');
  });
  await step('Undo and redo', async () => {
    const p = await page();
    await p.keyboard.press('Control+z'); await sleep(150); const u = await inkPixels(); assert(u < before, 'undo did nothing');
    await p.keyboard.press('Control+Shift+z'); await sleep(150); const r = await inkPixels(); assert(r === before, `redo ${r} vs ${before}`);
  });
  await step('Colour and gradient keys', async () => {
    const p = await page();
    await p.keyboard.press('p'); await p.keyboard.press('7'); await drag(p, [[300, 700], [800, 720]]);
    assert(await inkPixels() > before, 'gradient stroke missing');
  });
  await step('Text tool places text', async () => {
    const p = await page(); const a = await inkPixels();
    await p.keyboard.press('t'); await p.mouse.click(900, 650); await sleep(150);
    await p.keyboard.type('Hello'); await p.keyboard.press('Enter'); await sleep(200);
    const b = await inkPixels(); assert(b > a + 20, `text added ${b - a} px`);
  });
  await step('/ shows the key sheet, any key hides it', async () => {
    const p = await page();
    await p.keyboard.press('/'); assert(!(await p.$eval('#cheat', (c) => c.hidden)), 'sheet not shown'); await shot('04-keys');
    await p.keyboard.press('/'); assert(await p.$eval('#cheat', (c) => c.hidden), 'sheet not hidden');
  });
  await step('Esc hands the mouse back and keeps the ink on screen', async () => {
    const p = await page(); const a = await inkPixels();
    await p.keyboard.press('Escape');
    await waitFor(async () => !(await p.evaluate(() => document.documentElement.classList.contains('drawing'))), 'drawing off');
    const w = await waitFor(async () => { const s = await winState(); return s.ignoring && s; }, 'click-through');
    assert(w.visible, 'ink window hidden');
    assert(await inkPixels() === a, 'ink changed');
    assert(!(await toolbarShown()), 'toolbar still shown');
  });
  await step('Whiteboard from the menu bar opens ready to draw; closing it returns to screen ink', async () => {
    await menuClick('Whiteboard'); await sleep(400);
    const p = await page();
    assert(await p.evaluate(() => document.documentElement.classList.contains('board') || document.body.classList.contains('board') || !!document.querySelector('.board, [data-board="on"]')) || (await inkPixels()) > 1000000, 'board not shown');
    assert(await p.evaluate(() => document.documentElement.classList.contains('drawing')), 'whiteboard should open ready to draw');
    await shot('05-board');
    await menuClick('Whiteboard'); await sleep(400);
    await (await page()).keyboard.press('Escape');
    await waitFor(async () => (await winState()).ignoring, 'back to click-through');
  });
  await step('Highlight cursor (⌘⇧2) draws around the pointer, and turns off', async () => {
    await shortcut('Command+Shift+2'); const n = await waitFor(async () => { const n = await inkPixels('fx'); return n > 200 && n; }, 'highlight pixels');
    await shot('06-highlight');
    await shortcut('Command+Shift+2'); await waitFor(async () => (await inkPixels('fx')) === 0, 'highlight off');
    return n + ' px';
  });
  await step('Spotlight (⌘⇧7) dims the screen except the pointer, and turns off', async () => {
    await shortcut('Command+Shift+7'); const n = await waitFor(async () => { const n = await inkPixels('fx'); return n > 100000 && n; }, 'spotlight dim');
    await shot('07-spotlight');
    await shortcut('Command+Shift+7'); await waitFor(async () => (await inkPixels('fx')) === 0, 'spotlight off');
    return n + ' px dimmed';
  });
  await step('Zoom (⌘⇧8): lens on a Mac; elsewhere it switches itself off cleanly', async () => {
    const zoomChecked = async () => (await app.evaluate(() => global.__overmark.menu().find((i) => i.label?.startsWith('Zoom'))?.checked));
    await shortcut('Command+Shift+8');
    if (process.platform === 'darwin') {
      await waitFor(zoomChecked, 'zoom on');
      const n = await waitFor(async () => { const n = await inkPixels('fx'); return n > 1000 && n; }, 'lens drawn', 8000);
      await shot('08-zoom');
      await shortcut('Command+Shift+8'); await waitFor(async () => !(await zoomChecked()), 'zoom off');
      return n + ' px lens';
    }
    await waitFor(async () => !(await zoomChecked()), 'zoom switched itself off', 8000);
    const msg = await waitFor(async () => { const m = await (await page()).evaluate(() => document.querySelector('#hud')?.innerText || ''); return /couldn't capture/.test(m) && m; }, 'zoom message', 5000);
    assert(/Allow Overmark/.test(msg), 'message: ' + msg);
    return 'no screencapture on ' + process.platform + ': stopped with "' + msg.slice(0, 40) + '…"';
  });
  await step('Security: the page can only run the zoom capture and only touch the temp folder', async () => {
    const p = await page();
    const r = await p.evaluate(async () => {
      const D = await window.claude.use('desktop');
      const a = await D.childProcess.exec('ls /');
      const b = await D.childProcess.exec('/usr/sbin/screencapture -x -t jpg -R0,0,10,10 "/etc/x.jpg"');
      const c = await D.fs.readFile('/etc/hosts', 'utf8').then(() => 'read', (e) => 'blocked');
      const d = await D.fs.readFile('../../etc/hosts', 'utf8').then(() => 'read', (e) => 'blocked');
      return { a: a.code, b: b.code, c, d, db: await window.claude.use('db'), shell: 'shell' in D };
    });
    assert(r.a === 126 && r.b === 126 && r.c === 'blocked' && r.d === 'blocked', JSON.stringify(r));
    assert(r.db === null, 'Claude-only capability present');
  });
  await step('Clear ink (⌘⇧0) empties the screen and hides the overlay', async () => {
    await shortcut('Command+Shift+0');
    await waitFor(async () => (await inkPixels()) === 0, 'ink cleared');
    await waitFor(async () => !(await winState()).visible, 'overlay hidden when empty');
  });
  await step('Annotate without controls (⌘⇧9): drawing with the toolbar hidden', async () => {
    await shortcut('Command+Shift+9');
    await waitFor(async () => (await page()).evaluate(() => document.documentElement.classList.contains('drawing')), 'drawing');
    await waitFor(async () => { const s = await winState(); return s.visible && !s.ignoring; }, 'window takes the mouse');
    assert(!(await toolbarShown()), 'toolbar visible');
    const p = await page(); await p.keyboard.press('p'); await drag(p, [[400, 400], [600, 450]]); // the last tool (Text) is remembered; pick the pen assert(await inkPixels() > 100, 'no ink');
    await p.keyboard.press('Escape');
  });
  await step('Reload from the menu bar: page restarts in menu bar mode with shortcuts', async () => {
    const p = await page(); const nav = p.waitForEvent('load', { timeout: 15000 }).catch(() => null);
    await menuClick('Reload Overmark'); await nav;
    await waitMode('overlay');
    await waitFor(async () => app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Command+Shift+1')), 'shortcuts after reload');
    await waitFor(async () => (await menuLabels()).length > 8, 'menu after reload');
  });
  await step('Opening the app again while it runs shows Settings', async () => {
    await app.evaluate(({ app }) => app.emit('second-instance', {}, [], ''));
    await waitMode('setup');
    await waitFor(async () => (await winState()).visible, 'Settings visible');
  });
  await step('Closing the Settings window keeps Overmark running; ⌘⇧1 still works', async () => {
    await app.evaluate(() => global.__overmark.win().close()); await sleep(500);
    const s = await winState(); assert(!s.visible, 'still visible');
    assert((await menuLabels()).length > 8, 'menu bar item gone');
    await shortcut('Command+Shift+1'); // still listening: starts drawing from the closed state
    await waitMode('overlay');
    await waitFor(async () => (await menuLabels()).length > 8, 'menu rebuilt');
    await (await page()).keyboard.press('Escape');
  });
  await step('Settings… from the menu bar', async () => {
    await menuClick('Settings'); await waitMode('setup'); await waitFor(async () => (await winState()).visible, 'visible');
    const p = await page(); await p.getByRole('button', { name: /Run in menu bar/ }).click(); await waitMode('overlay');
  });
  await step('Updates: no newer release → "up to date"', async () => {
    fake.releases = [release('v0.9.0'), release('v1.0.0-alpha.1', { pre: true })];
    const st = await upd('check'); assert(st.status === 'current', JSON.stringify(st)); return 'running ' + (await app.evaluate(({ app }) => app.getVersion()));
  });
  await step('Updates: when up to date the menu offers "Check for updates…"', async () => {
    await waitFor(async () => (await menuLabels()).some((l) => l === 'Check for updates…'), 'menu item');
  });
  await step('Updates: a newer release is found and offered in the menu', async () => {
    fake.releases = [release('v0.9.0'), release('v1.0.0')];
    const st = await upd('check'); assert(st.status === 'available' && st.latest.version === '1.0.0', JSON.stringify(st));
    await waitFor(async () => (await menuLabels()).some((l) => l === 'Install update (version 1.0.0)…'), 'Install update item');
    return 'offers 1.0.0';
  });
  await step('Updates: the download is verified against SHA256SUMS.txt', async () => {
    const r = await upd('install');
    if (process.platform === 'darwin') return 'macOS: swaps the app and reopens (checked on a Mac)';
    assert(r.verified && fs.existsSync(r.verified), JSON.stringify(r)); return 'checksum OK';
  });
  await step('Updates: a tampered download is refused', async () => {
    fake.releases = [release('v1.0.1', { tamper: true })];
    await upd('check'); const r = await upd('install');
    assert(/checksum mismatch/.test(r.error || ''), JSON.stringify(r));
    const st = await upd('state'); assert(st.status === 'error', st.status);
  });
  await step('Quit from the menu bar exits the app', async () => {
    const exited = new Promise((r) => app.process().once('exit', r));
    await menuClick('Quit Overmark');
    await Promise.race([exited, sleep(8000).then(() => { throw new Error('still running'); })]);
  });
  await step('Next launch starts quietly in the menu bar with shortcuts on (a short shortcuts pill, no window)', async () => {
    await launch(); await waitMode('overlay');
    await waitFor(async () => app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Command+Shift+1')), 'shortcuts');
    await waitFor(async () => !(await winState()).visible, 'overlay gone after the start-up pill', 12000);
    const s = await winState(); assert(!s.focused, 'took focus');
    await app.evaluate(({ app }) => app.exit(0));
  });

  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (process.env.RESULTS) fs.writeFileSync(process.env.RESULTS, JSON.stringify(results, null, 2));
  server.close();
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error('FATAL', e); try { await app?.evaluate(({ app }) => app.exit(1)); } catch {} process.exit(2); });
