// Gives the Overmark page the same `window.claude.use("desktop")` API it gets inside
// Claude's desktop app, so one index.html runs both as a Claude app and as this standalone app.
const { contextBridge, ipcRenderer } = require('electron');

const call = (method, ...args) => ipcRenderer.invoke('om', method, args);

// Callbacks (global shortcuts, menu bar clicks) live here in the renderer; main sends ids back.
const shortcutCallbacks = new Map();
const trayCallbacks = new Map();
let trayClick = null;
let reopenCallback = null, updateCallback = null;
ipcRenderer.on('om:reopen', () => reopenCallback?.());
ipcRenderer.on('om:update', (_e, st) => updateCallback?.(st));
ipcRenderer.on('om:shortcut', (_e, acc) => shortcutCallbacks.get(acc)?.());
ipcRenderer.on('om:tray', (_e, id) => (id === '__click' ? trayClick?.() : trayCallbacks.get(id)?.({})));

// The page rebuilds the menu on every state change. A menu the person already has open still sends the
// ids it was built with, so callbacks from the last few menus are kept and a click is never lost.
let menuGeneration = 0;
function serializeMenu(items, gen) {
  return (items || []).map((it, i) => {
    const out = { ...it };
    delete out.click;
    if (it.click) { const id = `g${gen}_${trayCallbacks.size}_${i}`; trayCallbacks.set(id, it.click); out.id = id; }
    if (it.submenu) out.submenu = serializeMenu(it.submenu, gen);
    return out;
  });
}
function pruneMenus(gen) {
  for (const id of trayCallbacks.keys()) if (+id.slice(1, id.indexOf('_')) < gen - 4) trayCallbacks.delete(id);
}

const PERMS = { overlay: 'granted', shortcuts: 'granted', 'menu-bar': 'granted', 'full-access': 'granted', notifications: 'granted' };

const desktop = Object.freeze({
  install: { state: async () => 'installed', request: async () => 'installed' },
  permissions: {
    state: async (name) => (name ? PERMS[name] ?? 'unavailable' : { ...PERMS }),
    request: async () => ({ ...PERMS }),
    manage: () => call('permissions.manage'),
  },
  window: {
    setOptions: (o) => call('window.setOptions', o),
    getOptions: () => call('window.getOptions'),
    place: (p) => call('window.place', p),
    show: () => call('window.show'),
    hide: () => call('window.hide'),
    getBounds: () => call('window.getBounds'),
    setBounds: (b) => call('window.setBounds', b),
    print: () => call('window.print'),
    setIgnoreMouseEvents: (i, o) => call('window.setIgnoreMouseEvents', i, o),
    setVisibleOnAllWorkspaces: (v, o) => call('window.setVisibleOnAllWorkspaces', v, o),
  },
  Menu: { setApplicationMenu: async () => {}, popup: async () => {} },
  // Standalone only: the app was opened again (Finder, Spotlight, Launchpad) while already running in the menu bar.
  app: { onReopen: (cb) => { reopenCallback = typeof cb === 'function' ? cb : null; }, getVersion: () => call('app.version'), checkForUpdates: () => call('updates.check'), updateState: () => call('updates.state'), installUpdate: () => call('updates.install'),
    onUpdate: (cb) => { updateCallback = typeof cb === 'function' ? cb : null; }, dock: { setIcon: (d) => call('dock.setIcon', d), setBadge: async () => false, setProgress: async () => false, setMenu: async () => false } },
  screen: { getCursorScreenPoint: () => call('screen.getCursorScreenPoint'), getAllDisplays: () => call('screen.getAllDisplays') },
  globalShortcut: {
    register: async (acc, cb) => { const ok = await call('globalShortcut.register', acc); if (ok) shortcutCallbacks.set(acc, cb); return ok; },
    unregister: async (acc) => { shortcutCallbacks.delete(acc); return call('globalShortcut.unregister', acc); },
    unregisterAll: async () => { shortcutCallbacks.clear(); return call('globalShortcut.unregisterAll'); },
  },
  notification: { show: (o) => call('notification.show', o) },
  clipboard: { writeText: (t) => call('clipboard.writeText', t) },
  tray: {
    set: async (opts) => { const gen = ++menuGeneration; pruneMenus(gen); trayClick = opts.click || null; return call('tray.set', { ...opts, click: undefined, menu: serializeMenu(opts.menu, gen) }); },
    remove: () => call('tray.remove'),
  },
  fs: {
    readFile: (p, enc) => call('fs.readFile', p, enc),
    writeFile: (p, d, enc) => call('fs.writeFile', p, d, enc),
    exists: (p) => call('fs.exists', p),
  },
  childProcess: { exec: (cmd, opts) => call('childProcess.exec', cmd, opts) },
  os: { platform: () => call('os.platform'), arch: () => call('os.arch'), tmpdir: () => call('os.tmpdir'), homedir: () => call('os.homedir') },
});

contextBridge.exposeInMainWorld('claude', {
  standalone: true,
  // db / user / other Claude-only capabilities resolve null here; the page is built to work without them.
  use: async (name) => (name === 'desktop' ? desktop : null),
});
