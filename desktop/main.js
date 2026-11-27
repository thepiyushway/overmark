// Overmark standalone: hosts app/index.html (the same file published as the Claude app) in Electron
// and implements the desktop API the page expects. Runs as a menu bar app with no Dock icon.
const { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const updater = require('./updater');

if (!app.requestSingleInstanceLock()) app.quit();

const STATE_FILE = () => path.join(app.getPath('userData'), 'window-options.json');
const PAGE = path.join(__dirname, 'app', 'index.html');
const ALLOWED = ['titleBarStyle', 'trafficLightPosition', 'frame', 'transparent', 'alwaysOnTop', 'vibrancy', 'visualEffectState', 'movable', 'resizable',
  'minimizable', 'maximizable', 'fullscreenable', 'hasShadow', 'roundedCorners', 'backgroundColor', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'];

let lastMenu = [];
let win = null, tray = null, quitting = false, savedOptions = {}, appliedOptions = {}, ignoring = false;

function loadOptions() { try { return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); } catch { return {}; } }
function saveOptions(o) { try { fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true }); fs.writeFileSync(STATE_FILE(), JSON.stringify(o)); } catch {} }

function createWindow(opts) {
  const o = {};
  for (const k of ALLOWED) if (k in opts) o[k] = opts[k];
  const overlay = o.transparent === true;
  const w = new BrowserWindow({
    width: 940, height: 760, show: false, ...o,
    backgroundColor: overlay ? '#00000000' : (o.backgroundColor || '#f4f3ef'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  appliedOptions = { ...o };
  ignoring = false;
  if (overlay) {
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  w.on('close', (e) => { if (!quitting) { e.preventDefault(); w.hide(); } }); // keep running in the menu bar
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  w.loadFile(PAGE);
  w.once('ready-to-show', () => { if (!overlay) { w.show(); app.focus({ steal: true }); } });
  return w;
}

function rebuild(opts) {
  const old = win;
  win = createWindow(opts);
  if (old) { old.removeAllListeners('close'); old.destroy(); }
  if (tray) { tray.destroy(); tray = null; } // the new page sets its own menu bar item
  lastMenu = [];
}

// ---------------------------------------------------------------- IPC: the desktop API
const handlers = {
  'permissions.manage': async () => { shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'); },
  'window.setOptions': async (o) => {
    savedOptions = o || {}; saveOptions(savedOptions);
    setImmediate(() => rebuild(savedOptions));
    return { applied: 'now', reloading: true, options: savedOptions };
  },
  'updates.check': async () => updater.check(),
  'window.getOptions': async () => ({ options: savedOptions, applied: appliedOptions }),
  'window.place': async () => { const [w, h] = win.getSize(); return { width: w, height: h }; },
  'window.show': async () => {
    // Click-through overlay: appear without taking the keyboard. Drawing: take it.
    if (appliedOptions.transparent && ignoring) win.showInactive();
    else { win.show(); win.focus(); app.focus({ steal: true }); }
  },
  'window.hide': async () => { win.hide(); },
  'window.getBounds': async () => win.getBounds(),
  'window.setBounds': async (b) => { win.setBounds({ ...win.getBounds(), ...b }); },
  'window.print': async () => false,
  'window.setIgnoreMouseEvents': async (i, o) => { ignoring = !!i; win.setIgnoreMouseEvents(!!i, o || {}); },
  'window.setVisibleOnAllWorkspaces': async (v, o) => { win.setVisibleOnAllWorkspaces(!!v, o || {}); },
  'dock.setIcon': async (dataUrl) => { const img = nativeImage.createFromDataURL(dataUrl); if (app.dock && !img.isEmpty()) app.dock.setIcon(img); return { written: true }; },
  'screen.getCursorScreenPoint': async () => screen.getCursorScreenPoint(),
  'screen.getAllDisplays': async () => screen.getAllDisplays().map((d) => ({ id: d.id, label: d.label, bounds: d.bounds, workArea: d.workArea,
    size: d.size, workAreaSize: d.workAreaSize, scaleFactor: d.scaleFactor, rotation: d.rotation, internal: d.internal })),
  'globalShortcut.register': async (acc) => {
    if (globalShortcut.isRegistered(acc)) globalShortcut.unregister(acc);
    try { return globalShortcut.register(acc, () => win?.webContents.send('om:shortcut', acc)); } catch { return false; }
  },
  'globalShortcut.unregister': async (acc) => { globalShortcut.unregister(acc); },
  'globalShortcut.unregisterAll': async () => { globalShortcut.unregisterAll(); },
  'notification.show': async ({ body }) => { new Notification({ title: 'Overmark', body: String(body).slice(0, 300) }).show(); },
  'tray.set': async (opts) => { setTray(opts); return true; },
  'tray.remove': async () => { tray?.destroy(); tray = null; },
  // The page only needs the zoom lens: screencapture into the temp folder, then read the image back.
  // Nothing else is allowed, so a public build can't be made to run commands or touch other files.
  'fs.readFile': async (p, enc) => fs.promises.readFile(inTmp(p), enc || undefined),
  'fs.writeFile': async (p, d, enc) => fs.promises.writeFile(inTmp(p), d, enc || undefined),
  'fs.exists': async (p) => fs.existsSync(inTmp(p)),
  'childProcess.exec': (cmd, opts = {}) => new Promise((resolve) => {
    const m = /^\/usr\/sbin\/screencapture -x -t jpg -R-?\d+,-?\d+,\d+,\d+ "([^"]+)"$/.exec(String(cmd));
    if (!m) return resolve({ stdout: '', stderr: 'EPERM: only the zoom capture is allowed', code: 126, signal: null, truncated: false });
    try { inTmp(m[1]); } catch (e) { return resolve({ stdout: '', stderr: e.message, code: 126, signal: null, truncated: false }); }
    exec(cmd, { timeout: Math.min(opts.timeout || 8000, 15000), cwd: os.tmpdir(), maxBuffer: 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ stdout: String(stdout), stderr: String(stderr), code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, signal: err?.signal || null, truncated: false }));
  }),
  'os.platform': async () => process.platform, 'os.arch': async () => process.arch,
  'os.tmpdir': async () => os.tmpdir(), 'os.homedir': async () => os.homedir(),
};
const TMP = fs.realpathSync(os.tmpdir());
const inTmp = (p) => {
  const abs = path.resolve(TMP, String(p));
  if (abs !== TMP && !abs.startsWith(TMP + path.sep) && !abs.startsWith(os.tmpdir() + path.sep)) throw new Error('EPERM: outside the temp folder');
  return abs;
};
ipcMain.handle('om', async (e, method, args) => {
  if (!win || e.sender !== win.webContents) throw new Error('EPERM: unknown window');
  const h = handlers[method];
  if (!h) throw new Error('ENOSYS: ' + method);
  return h(...args);
});

// ---------------------------------------------------------------- menu bar item
let lastTrayOpts = null;
function setTray(opts) {
  lastTrayOpts = opts;
  const icon = opts.icon ? nativeImage.createFromDataURL(opts.icon).resize({ height: 18 }) : nativeImage.createEmpty();
  if (opts.iconIsTemplate !== false) icon.setTemplateImage(true);
  if (!tray) tray = new Tray(icon); else tray.setImage(icon);
  if (opts.title) tray.setTitle(opts.title);
  tray.setToolTip(['Overmark', opts.toolTip].filter(Boolean).join('\n'));
  const toItems = (items) => items.map((it) => {
    const m = { label: it.label, type: it.type, enabled: it.enabled, checked: it.checked };
    if (it.submenu) m.submenu = toItems(it.submenu);
    if (it.href) m.click = () => shell.openExternal(it.href);
    else if (it.id) m.click = () => win?.webContents.send('om:tray', it.id);
    return m;
  });
  const items = toItems(opts.menu || []);
  items.push({ type: 'separator' }, ...updater.menuItems(),
    { label: 'Open at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked }) },
    { label: 'Quit Overmark', accelerator: 'Command+Q', click: () => { quitting = true; app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(items));
  lastMenu = items;
}
// The end-to-end test (tests/standalone_e2e.js) reads the menu bar menu and the window through this hook. Off in normal use.
if (process.env.OVERMARK_TEST === '1') global.__overmark = { menu: () => lastMenu, win: () => win, ignoring: () => ignoring, updater };

// ---------------------------------------------------------------- lifecycle
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide(); // menu bar app: no Dock icon to remove or lose
  savedOptions = loadOptions();
  win = createWindow(savedOptions);
  updater.start(() => { if (tray && lastTrayOpts) setTray(lastTrayOpts); }); // refresh the menu's update item
});
// Opening the app again while it runs (it has no Dock icon) brings up Settings rather than doing nothing.
function reopen() {
  if (!win) return;
  if (appliedOptions.transparent) win.webContents.send('om:reopen');
  else { win.show(); win.focus(); app.focus({ steal: true }); }
}
app.on('second-instance', reopen);
app.on('activate', reopen);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {}); // stay in the menu bar
app.on('will-quit', () => globalShortcut.unregisterAll());
