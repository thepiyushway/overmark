// Overmark's updater for the downloadable Mac app.
// Apple's built-in update framework only works for apps signed with a paid Developer ID, so this does it directly:
//   1. ask GitHub Releases for the newest version (pre-releases only if you're running one);
//   2. download the zip for this Mac's chip, and check its SHA-256 against the release's SHA256SUMS.txt;
//   3. unpack it, check the code signature and the app ID;
//   4. swap it in for the running copy once Overmark quits, and reopen it.
// If the app can't be replaced where it is (still inside the DMG, or a read-only folder), it opens the release page instead.
const { app, shell, Notification } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const REPO = 'thepiyushway/overmark';
const APP_ID = 'app.overmark.Overmark';
const API = process.env.OVERMARK_TEST === '1' && process.env.OVERMARK_UPDATE_URL
  ? process.env.OVERMARK_UPDATE_URL
  : `https://api.github.com/repos/${REPO}/releases?per_page=15`;
const CHECK_EVERY = 12 * 60 * 60 * 1000;

let state = { status: 'idle', latest: null, error: null }; // status: idle | checking | current | available | downloading | ready | error
let onChange = () => {};

// ---------------------------------------------------------------- versions
function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v).trim());
  if (!m) return null;
  return { nums: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] };
}
function compare(a, b) { // semver precedence: >0 if a is newer than b
  const x = parse(a), y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) - (y.pre.length ? -1 : 0);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn && +p !== +q) return +p - +q;
    if (pn !== qn) return pn ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}
const isPre = (v) => (parse(v)?.pre.length || 0) > 0;

// ---------------------------------------------------------------- network
function get(url, { json = false, file = null, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http://') ? http : https;
    const req = mod.get(url, { headers: { 'User-Agent': `Overmark/${app.getVersion()}`, Accept: json ? 'application/vnd.github+json' : 'application/octet-stream' }, timeout: 30000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), { json, file, redirects: redirects - 1 }));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} from ${new URL(url).host}`)); }
      if (file) {
        const out = fs.createWriteStream(file);
        const hash = crypto.createHash('sha256');
        res.on('data', (c) => hash.update(c));
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(hash.digest('hex'))));
        out.on('error', reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const s = Buffer.concat(chunks).toString('utf8'); try { resolve(json ? JSON.parse(s) : s); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}
const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 120000 }, (e, out, err) => (e ? reject(new Error(`${path.basename(cmd)}: ${(err || e.message).trim()}`)) : resolve(String(out)))));

// ---------------------------------------------------------------- checking
function set(s) { state = { ...state, ...s }; onChange(state); }

async function check({ manual = false } = {}) {
  if (state.status === 'checking' || state.status === 'downloading') return state;
  set({ status: 'checking', error: null });
  try {
    const current = app.getVersion();
    const list = await get(API, { json: true });
    const wantPre = isPre(current);
    const releases = (Array.isArray(list) ? list : [list]).filter((r) => r && !r.draft && (wantPre || !r.prerelease) && parse(r.tag_name));
    releases.sort((a, b) => compare(b.tag_name, a.tag_name));
    const newest = releases[0];
    if (!newest || compare(newest.tag_name, current) <= 0) {
      set({ status: 'current', latest: newest ? summary(newest) : null });
      if (manual) notify(`You're up to date (version ${current}).`);
      return state;
    }
    set({ status: 'available', latest: summary(newest) });
    notify(`Version ${state.latest.version} is available. Open the Overmark menu and choose Install update.`);
  } catch (e) {
    set({ status: 'error', error: e.message });
    if (manual) notify(`Couldn't check for updates: ${e.message}`);
  }
  return state;
}

function summary(r) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const assets = r.assets || [];
  const zip = assets.find((a) => new RegExp(`-${arch}-mac\\.zip$`).test(a.name));
  const sums = assets.find((a) => a.name === 'SHA256SUMS.txt');
  return { version: String(r.tag_name).replace(/^v/, ''), tag: r.tag_name, page: r.html_url, zip: zip && { name: zip.name, url: zip.browser_download_url }, sums: sums && sums.browser_download_url };
}

function notify(body) {
  try { if (Notification.isSupported()) new Notification({ title: 'Overmark', body }).show(); } catch {}
}

// ---------------------------------------------------------------- installing
function bundlePath() {
  // .../Overmark.app/Contents/Resources/app.asar → .../Overmark.app
  const p = path.resolve(app.getAppPath(), '..', '..', '..');
  return p.endsWith('.app') ? p : null;
}
function canReplace(bundle) {
  if (!bundle || bundle.startsWith('/Volumes/') || /AppTranslocation/.test(bundle)) return false;
  try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK); return true; } catch { return false; }
}

// Downloads, verifies and unpacks the update. Returns the path of the new Overmark.app (or of the verified zip off macOS).
async function download() {
  const latest = state.latest;
  if (!latest?.zip || !latest?.sums) throw new Error('this release has no download for your Mac');
  set({ status: 'downloading' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overmark-update-'));
  const zipFile = path.join(dir, latest.zip.name);
  const sums = await get(latest.sums);
  const line = sums.split('\n').map((l) => l.trim().split(/\s+/)).find(([, name]) => name && name.replace(/^\*/, '') === latest.zip.name);
  if (!line || !/^[0-9a-f]{64}$/i.test(line[0])) throw new Error('the release has no checksum for ' + latest.zip.name);
  const got = await get(latest.zip.url, { file: zipFile });
  if (got.toLowerCase() !== line[0].toLowerCase()) throw new Error('the download is corrupted (checksum mismatch), so it was not installed');
  if (process.platform !== 'darwin') return { dir, zipFile, app: null };
  await run('/usr/bin/ditto', ['-x', '-k', zipFile, dir]);
  const newApp = path.join(dir, 'Overmark.app');
  if (!fs.existsSync(newApp)) throw new Error('the download has no Overmark.app');
  const id = (await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', path.join(newApp, 'Contents', 'Info.plist')])).trim();
  if (id !== APP_ID) throw new Error('the download is not Overmark (' + id + ')');
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', newApp]);
  await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', newApp]).catch(() => {});
  return { dir, zipFile, app: newApp };
}

async function install() {
  const bundle = bundlePath();
  if (process.platform === 'darwin' && !canReplace(bundle)) {
    shell.openExternal(state.latest?.page || `https://github.com/${REPO}/releases/latest`);
    notify('Overmark can\'t update itself from here. Move Overmark to Applications, or download the new version from the page that just opened.');
    return { opened: 'page' };
  }
  let res;
  try { res = await download(); }
  catch (e) { set({ status: 'error', error: e.message }); notify('Update failed: ' + e.message); return { error: e.message }; }
  if (!res.app) { set({ status: 'ready' }); return { verified: res.zipFile }; } // off macOS (tests): verified, nothing to swap
  set({ status: 'ready' });
  // Swap the bundle after this process exits, then reopen. Keeps the old copy until the new one is in place.
  const script = path.join(res.dir, 'swap.sh');
  fs.writeFileSync(script, `#!/bin/sh
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done
OLD="$1.previous"
rm -rf "$OLD"
mv "$1" "$OLD" && mv "$2" "$1" && rm -rf "$OLD" || { [ -d "$OLD" ] && [ ! -d "$1" ] && mv "$OLD" "$1"; }
open "$1"
rm -rf "$3"
`, { mode: 0o755 });
  spawn('/bin/sh', [script, bundle, res.app, res.dir], { detached: true, stdio: 'ignore' }).unref();
  notify(`Installing version ${state.latest.version}. Overmark will reopen in a moment.`);
  setTimeout(() => app.exit(0), 400); // exits without the close-to-menu-bar handler; swap.sh reopens the new copy
  return { installing: state.latest.version };
}

// ---------------------------------------------------------------- menu items and schedule
function menuItems() {
  const s = state;
  if (s.status === 'available') return [{ label: `Install update (version ${s.latest.version})…`, click: () => install() }, { label: 'What\'s new…', click: () => shell.openExternal(s.latest.page) }];
  if (s.status === 'downloading') return [{ label: 'Downloading update…', enabled: false }];
  if (s.status === 'ready') return [{ label: 'Installing update…', enabled: false }];
  return [{ label: s.status === 'checking' ? 'Checking for updates…' : 'Check for updates…', enabled: s.status !== 'checking', click: () => check({ manual: true }) }];
}

function start(changed) {
  onChange = changed || (() => {});
  if (process.env.OVERMARK_NO_UPDATE_CHECK === '1') return;
  setTimeout(() => check(), 15000);
  setInterval(() => check(), CHECK_EVERY).unref?.();
}

module.exports = { start, check, install, download, menuItems, compare, getState: () => state };
