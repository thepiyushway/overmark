// Gives the Overmark page the same `window.claude.use("desktop")` API it gets inside
// Claude's desktop app, so one index.html runs both as a Claude app and as this standalone app.
const { contextBridge, ipcRenderer } = require('electron');

const call = (method, ...args) => ipcRenderer.invoke('om', method, args);

// Callbacks (global shortcuts, menu bar clicks) live here in the renderer; main sends ids back.
const shortcutCallbacks = new Map();
const trayCallbacks = new Map();
let trayClick = null;
ipcRenderer.on('om:shortcut', (_e, acc) => shortcutCallbacks.get(acc)?.());
ipcRenderer.on('om:tray', (_e, id) => (id === '__click' ? trayClick?.() : trayCallbacks.get(id)?.({})));

function serializeMenu(items) {
  return (items || []).map((it) => {
    const out = { ...it };
    delete out.click;
    if (it.click) { const id = 'm' + trayCallbacks.size + '_' + Math.random().toString(36).slice(2, 8); trayCallbacks.set(id, it.click); out.id = id; }
    if (it.submenu) out.submenu = serializeMenu(it.submenu);
    return out;
  });
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
  app: { dock: { setIcon: (d) => call('dock.setIcon', d), setBadge: async () => false, setProgress: async () => false, setMenu: async () => false } },
  screen: { getCursorScreenPoint: () => call('screen.getCursorScreenPoint'), getAllDisplays: () => call('screen.getAllDisplays') },
  globalShortcut: {
    register: async (acc, cb) => { const ok = await call('globalShortcut.register', acc); if (ok) shortcutCallbacks.set(acc, cb); return ok; },
    unregister: async (acc) => { shortcutCallbacks.delete(acc); return call('globalShortcut.unregister', acc); },
    unregisterAll: async () => { shortcutCallbacks.clear(); return call('globalShortcut.unregisterAll'); },
  },
  notification: { show: (o) => call('notification.show', o) },
  tray: {
    set: async (opts) => { trayCallbacks.clear(); trayClick = opts.click || null; return call('tray.set', { ...opts, click: undefined, menu: serializeMenu(opts.menu) }); },
    remove: () => call('tray.remove'),
  },
  fs: {
    readFile: (p, enc) => call('fs.readFile', p, enc),
    writeFile: (p, d, enc) => call('fs.writeFile', p, d, enc),
    exists: (p) => call('fs.exists', p),
  },
  childProcess: { exec: (cmd, opts) => call('childProcess.exec', cmd, opts) },
  os: { platform: () => call('os.platform'), arch: () => call('os.arch'), tmpdir: () => call('os.tmpdir'), homedir: () => call('os.homedir') },
  shell: { openPath: (p) => call('shell.openPath', p), showItemInFolder: (p) => call('shell.showItemInFolder', p), trashItem: (p) => call('shell.trashItem', p) },
});

contextBridge.exposeInMainWorld('claude', {
  standalone: true,
  // db / user / other Claude-only capabilities resolve null here; the page is built to work without them.
  use: async (name) => (name === 'desktop' ? desktop : null),
});
