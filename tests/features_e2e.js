// Feature-by-feature test of the standalone app: every setting, drawing tool, toolbar button, shortcut-editor
// rule, menu bar item and update notice, each checked by what it actually does on screen.
// Run from desktop/:  npm run test:features   (Linux CI: xvfb-run -a … ; zoom uses tests/fixtures/fake-screencapture.sh)
const H = require('./lib/harness');
const { section, step, assert, waitFor, sleep, page, hasClass, waitMode, winState, shortcut, isRegistered, menuItem, menuClick, menuLabels,
  drag, pixels, pixelAt, inkBox, canvasHash, toolbarShown, hudText, stored, openTab, setControl, captureAvailable, captures, resetCaptures, upd, fake, release, shot } = H;

const DEFAULT_PALETTE = ['#ff3b30', '#ffd60a', '#0a84ff', '#30d158', '#ff9f0a', '#ffffff'];
const DEFAULT_BAR_HIDDEN = ['color:4', 'color:5', 'color:6'];
const DENY = '/tmp/overmark-capture-deny';
const DEFAULT_KEYS = { annotate: 'Command+Shift+1', highlight: 'Command+Shift+2', spotlight: 'Command+Shift+7', zoom: 'Command+Shift+8', annotateBare: 'Command+Shift+9', clear: 'Command+Shift+0', board: null, erase: null, shot: null };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b, tol = 40) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol);

// ---------------------------------------------------------------- moving around the app
async function toOverlay() {
  if (await hasClass('overlay')) return page();
  const p = await page();
  await p.getByRole('button', { name: /Run in menu bar/ }).click();
  await waitMode('overlay');
  await waitFor(async () => (await menuLabels()).length > 8, 'menu bar menu');
  return page();
}
async function toSettings(tab) {
  if (!(await hasClass('setup'))) { await menuClick('Settings'); await waitMode('setup'); }
  if (tab) await openTab(tab);
  return page();
}
async function startDraw() {
  if (!(await hasClass('drawing'))) await shortcut('Command+Shift+1');
  await waitFor(async () => { const s = await winState(); return (await hasClass('drawing')) && s.visible && !s.ignoring; }, 'drawing ready');
  return page();
}
async function stopDraw() {
  const p = await page();
  if (await hasClass('drawing')) { await p.keyboard.press('Escape'); await waitFor(async () => !(await hasClass('drawing')), 'drawing off'); }
}
async function clearInk() { const p = await page(); if ((await pixels()) > 0) { await p.keyboard.press('x'); await waitFor(async () => (await pixels()) === 0, 'ink cleared'); } }
// Settings previews draw at the pointer: park the pointer in the middle of the preview, then fingerprint it.
// Moving to the same spot twice fires no event, so step in from beside it.
async function parkInPreview(sel) { const p = await page(); const el = await p.$(sel); await el.scrollIntoViewIfNeeded(); const b = await el.boundingBox(); await p.mouse.move(b.x + b.width / 2 + 7, b.y + b.height / 2 + 5); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 2 }); await sleep(180); return { p, cx: b.width / 2, cy: b.height / 2 }; }
const previewHash = async (sel) => { await parkInPreview(sel); return canvasHash(sel + ' canvas'); };
const previewPixel = async (sel, dx, dy) => (await page()).evaluate(([sel, dx, dy]) => {
  const box = document.querySelector(sel), c = box.querySelector('canvas'), k = c.width / box.clientWidth;
  return [...c.getContext('2d').getImageData(Math.round((box.clientWidth / 2 + dx) * k), Math.round((box.clientHeight / 2 + dy) * k), 1, 1).data];
}, [sel, dx, dy]);
const previewAlphaStats = async (sel) => (await page()).evaluate((sel) => {
  const c = document.querySelector(sel + ' canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const hist = {};
  let partial = 0, solid = 0; for (let i = 3; i < d.length; i += 4) { if (d[i] > 10 && d[i] < 140) partial++; else if (d[i] >= 140) solid++; } return { partial, solid };
}, sel);
async function strokeBox(p, from, to, region) { await drag(p, [from, to]); return inkBox('ink', region); }
// Width (CSS px) of the transparent gap around x on row y of the ink layer.
const gapAt = async (y, x) => (await page()).evaluate(([y, x]) => {
  const c = document.getElementById('ink'), k = c.width / c.getBoundingClientRect().width, w = c.width / k;
  const row = c.getContext('2d').getImageData(0, Math.round(y * k), c.width, 1).data, a = (px) => row[Math.round(px * k) * 4 + 3];
  if (a(x) > 40) return 0; let l = x, r = x; while (l > 0 && a(l - 1) <= 40) l--; while (r < w - 1 && a(r + 1) <= 40) r++; return r - l + 1;
}, [y, x]);
// A stylus stroke: real PointerEvents with pointerType "pen" and a fixed pressure.
async function penStroke(p, y, pressure) {
  await p.evaluate(([y, pr]) => {
    const el = document.getElementById('surface'), r = el.getBoundingClientRect();
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 77, pointerType: 'pen', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : pr, clientX: r.left + x, clientY: r.top + y }));
    ev('pointerdown', 300); for (let x = 310; x <= 800; x += 10) ev('pointermove', x); ev('pointerup', 800);
  }, [y, pressure]);
  await sleep(150);
}

(async () => {
  await H.launch({ fresh: true });
  await waitMode('setup');

  // ==================================================================== Settings · General
  section('Settings · General');
  await step('Tips on: the overlay greets you with the shortcut list', async () => {
    await toOverlay();
    const t = await waitFor(async () => { const t = await hudText(); return /Overmark is on/.test(t) && t; }, 'welcome tip', 5000);
    return t.replace(/\s+/g, ' ').slice(0, 60) + '…';
  });
  await step('Tips off: no welcome tip', async () => {
    await toSettings('general'); await setControl('tips', false); await toOverlay(); await sleep(1200);
    assert(!/Overmark is on/.test(await hudText()), 'tip shown');
    await toSettings('general'); await setControl('tips', true);
  });
  await step('Toolbar position: Bottom puts the drawing toolbar at the bottom', async () => {
    await setControl('toolbarPos', 'bottom'); await toOverlay(); const p = await startDraw();
    const r = await p.$eval('#bar', (b) => b.getBoundingClientRect().toJSON()); const w = await winState();
    assert(r.top > w.bounds.height / 2, `toolbar top ${r.top} of ${w.bounds.height}`);
    await stopDraw(); await toSettings('general'); await setControl('toolbarPos', 'top'); await toOverlay(); await startDraw();
    const r2 = await (await page()).$eval('#bar', (b) => b.getBoundingClientRect().toJSON()); assert(r2.top < w.bounds.height / 2, 'back on top');
    await stopDraw(); return `bottom at y=${Math.round(r.top)}, top at y=${Math.round(r2.top)}`;
  });
  await step('Show toolbar off: annotating starts with the toolbar hidden', async () => {
    await toSettings('general'); await setControl('showToolbar', false); await toOverlay(); await startDraw();
    assert(!(await toolbarShown()), 'toolbar visible'); await stopDraw();
    await toSettings('general'); await setControl('showToolbar', true); await toOverlay(); await startDraw();
    assert(await toolbarShown(), 'toolbar hidden after turning it back on'); await stopDraw();
  });
  await step('Diagnostics shows live state, and Copy puts it on the clipboard', async () => {
    const p = await toSettings('general');
    const txt = await waitFor(async () => { const t = await p.$eval('#diagText', (e) => e.textContent); return /"permissions"/.test(t) && t; }, 'diagnostics');
    await p.click('[data-do="copydiag"]');
    const clip = await waitFor(async () => { const c = await H.app().evaluate(({ clipboard }) => clipboard.readText()); return /"permissions"/.test(c) && c; }, 'clipboard', 4000);
    assert(clip.length === txt.length, 'clipboard differs from what is shown');
    return clip.length + ' chars copied';
  });

  // ==================================================================== Settings · Annotate
  section('Settings · Annotate');
  await step('Palette: editing colour 1 changes the toolbar swatch and the ink', async () => {
    await toSettings('annotate'); await setControl('palette.0', '#00ff00');
    const p = await toOverlay(); await startDraw(); await p.keyboard.press('p'); await p.keyboard.press('1');
    const sw = await p.$eval('[data-color="0"] .sw', (e) => getComputedStyle(e).backgroundColor);
    assert(sw === 'rgb(0, 255, 0)', 'swatch ' + sw);
    const b = await strokeBox(p, [300, 300], [700, 300]); assert(near(b.color, [0, 255, 0]), 'ink ' + b.color);
    await clearInk(); await stopDraw(); return 'swatch and ink green';
  });
  await step('Gradient ink blends from the first colour to the second', async () => {
    await toSettings('annotate'); await setControl('gradient.0', '#0000ff'); await setControl('gradient.1', '#ff0000');
    const p = await toOverlay(); await startDraw(); await p.keyboard.press('p'); await p.keyboard.press('7');
    await drag(p, [[300, 400], [700, 400], [1100, 400]]);
    const a = await pixelAt('ink', 310, 400), z = await pixelAt('ink', 1090, 400);
    assert(a[2] > a[0] + 80, 'start not blue: ' + a); assert(z[0] > z[2] + 80, 'end not red: ' + z);
    await clearInk(); await stopDraw(); return `start rgb(${a.slice(0, 3)}) → end rgb(${z.slice(0, 3)})`;
  });
  await step('Line weight scales every stroke width', async () => {
    const thickness = async (scale) => {
      await toSettings('annotate'); await setControl('widthScale', scale);
      const p = await toOverlay(); await startDraw(); await p.keyboard.press('p'); await p.keyboard.press('2');
      const b = await strokeBox(p, [300, 500], [800, 500]); await clearInk(); await stopDraw(); return b.h;
    };
    const thin = await thickness(0.5), thick = await thickness(2);
    assert(thick > thin * 2.5, `0.5× → ${thin}px, 2× → ${thick}px`);
    await toSettings('annotate'); await setControl('widthScale', 1);
    return `0.5× → ${thin.toFixed(0)} px, 2× → ${thick.toFixed(0)} px`;
  });
  await step('Auto-erase: each mark fades out after the set time', async () => {
    await toSettings('annotate'); await setControl('eraseAfter', 1); await setControl('autoErase', true);
    const p = await toOverlay(); await startDraw(); await p.keyboard.press('p');
    await drag(p, [[300, 300], [600, 320]]); const t0 = Date.now(); assert((await pixels()) > 0, 'no ink');
    await sleep(700); assert((await pixels()) > 0, 'faded too early');
    await waitFor(async () => (await pixels()) === 0, 'ink faded', 6000);
    const took = (Date.now() - t0) / 1000; await stopDraw();
    await toSettings('annotate'); await setControl('autoErase', false);
    return `gone after ${took.toFixed(1)} s (set to 1 s + fade)`;
  });
  for (const [style, check, label] of [
    ['white', (c) => c[0] > 235 && c[1] > 235 && c[2] > 235, 'white'],
    ['dark', (c) => c[0] < 70 && c[1] < 70 && c[2] < 70, 'dark'],
  ]) {
    await step(`Whiteboard style: ${label}`, async () => {
      await toSettings('annotate'); await setControl('board', style);
      const p = await toOverlay(); await startDraw(); await p.keyboard.press('b'); await sleep(250);
      const c = await pixelAt('ink', 33, 501); assert(c[3] > 240 && check(c), 'board pixel ' + c);
      await shot('board-' + style); await p.keyboard.press('b'); await stopDraw(); return `rgb(${c.slice(0, 3)})`;
    });
  }
  await step('Whiteboard style: white with dots', async () => {
    await toSettings('annotate'); await setControl('board', 'grid');
    const p = await toOverlay(); await startDraw(); await p.keyboard.press('b'); await sleep(250);
    const dots = await p.evaluate(() => { const c = document.getElementById('ink'); const d = c.getContext('2d').getImageData(0, Math.round(c.height / 2), c.width, 60).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 225) n++; return n; });
    assert(dots > 20, 'no dots: ' + dots); await p.keyboard.press('b'); await stopDraw();
    await toSettings('annotate'); await setControl('board', 'white'); return dots + ' dot pixels in a strip';
  });

  // ==================================================================== Settings · Cursor highlight (live preview)
  section('Settings · Cursor highlight');
  const PV = '#pvCursor';
  await step('Preview follows the pointer', async () => {
    await toSettings('cursor'); await setControl('hl.hideIdle', false); await setControl('hl.anim', 'none');
    const a = await previewHash(PV); const p = await page(); const b = await (await p.$(PV)).boundingBox();
    await p.mouse.move(b.x + 40, b.y + 40); await sleep(150); const c = await canvasHash(PV + ' canvas');
    assert(a.h !== c.h, 'preview did not move');
  });
  await step('Shape: circle, ring, squircle and rhombus each look different', async () => {
    const hs = {}; for (const s of ['circle', 'ring', 'squircle', 'rhombus']) { await setControl('hl.shape', s); hs[s] = (await previewHash(PV)).h; }
    assert(new Set(Object.values(hs)).size === 4, JSON.stringify(hs)); await setControl('hl.shape', 'circle'); return '4 distinct';
  });
  await step('Size changes the highlight area', async () => {
    await setControl('hl.size', 30); const a = (await previewHash(PV)).n; await setControl('hl.size', 140); const b = (await previewHash(PV)).n;
    assert(b > a * 3, `${a} → ${b}`); await setControl('hl.size', 56); return `${a} → ${b} px`;
  });
  await step('Colour and opacity', async () => {
    await setControl('hl.border', 'none'); await setControl('hl.glow', false); await setControl('hl.color', '#00ff00');
    await setControl('hl.opacity', 0.2); await parkInPreview(PV); const lo = await previewPixel(PV, -12, -12);
    await setControl('hl.opacity', 0.9); await parkInPreview(PV); const hi = await previewPixel(PV, -12, -12);
    assert(hi[1] > 200 && hi[0] < 80, 'not green: ' + hi); assert(hi[3] > lo[3] + 100, `alpha ${lo[3]} → ${hi[3]}`);
    await setControl('hl.color', '#ffd60a'); await setControl('hl.opacity', 0.32); return `alpha ${lo[3]} → ${hi[3]}`;
  });
  await step('Border style: solid, dashed, dotted and none each look different', async () => {
    const hs = {}; for (const s of ['solid', 'dashed', 'dotted', 'none']) { await setControl('hl.border', s); hs[s] = (await previewHash(PV)).h; }
    assert(new Set(Object.values(hs)).size === 4, JSON.stringify(hs)); await setControl('hl.border', 'solid'); return '4 distinct';
  });
  await step('Border width', async () => {
    await setControl('hl.borderWidth', 1); const a = await previewHash(PV); await setControl('hl.borderWidth', 9); const b = await previewHash(PV);
    assert(a.h !== b.h && b.n > a.n, `${a.n} → ${b.n}`); await setControl('hl.borderWidth', 3); return `${a.n} → ${b.n} px`;
  });
  await step('Glow', async () => {
    await setControl('hl.glow', false); const a = await previewHash(PV); await setControl('hl.glow', true); const b = await previewHash(PV);
    assert(b.n > a.n, `${a.n} → ${b.n}`); return `${a.n} → ${b.n} px`;
  });
  await step('Animation: pulse and breathe move; none stays still', async () => {
    const moving = async () => { await parkInPreview(PV); const a = await canvasHash(PV + ' canvas'); await sleep(260); const b = await canvasHash(PV + ' canvas'); return a.h !== b.h; };
    await setControl('hl.anim', 'none'); assert(!(await moving()), 'none moved');
    await setControl('hl.anim', 'pulse'); assert(await moving(), 'pulse still');
    await setControl('hl.anim', 'breathe'); assert(await moving(), 'breathe still');
    await setControl('hl.anim', 'none');
  });
  await step('Hide when inactive: fades after the set time; off keeps it', async () => {
    await setControl('hl.idleMs', 500); await setControl('hl.hideIdle', true);
    const a = (await previewHash(PV)).n; await sleep(1200); const b = (await canvasHash(PV + ' canvas')).n;
    assert(b < a * 0.5, `${a} → ${b}`);
    await setControl('hl.hideIdle', false); const c = (await previewHash(PV)).n; await sleep(1200); const d = (await canvasHash(PV + ' canvas')).n;
    assert(d > c * 0.8, `kept: ${c} → ${d}`); return `${a} → ${b} px after 1.2 s`;
  });
  await step('The overlay highlight uses these settings', async () => {
    await setControl('hl.color', '#00ff00'); await setControl('hl.opacity', 1); await setControl('hl.border', 'none'); await setControl('hl.glow', false);
    await toOverlay(); await shortcut('Command+Shift+2');
    const [cx, cy] = await H.app().evaluate(({ screen }) => { const p = screen.getCursorScreenPoint(); const b = global.__overmark.win().getBounds(); return [p.x - b.x, p.y - b.y]; });
    const c = await waitFor(async () => { const c = await pixelAt('fx', cx - 10, cy - 10); return c[3] > 200 && c; }, 'highlight drawn');
    assert(c[1] > 200 && c[0] < 80, 'not green: ' + c); await shortcut('Command+Shift+2');
    await toSettings('cursor'); await setControl('hl.color', '#ffd60a'); await setControl('hl.opacity', 0.32); await setControl('hl.border', 'solid'); await setControl('hl.glow', true); await setControl('hl.hideIdle', true);
    return `rgb(${c.slice(0, 3)}) at the pointer`;
  });

  // ==================================================================== Settings · Spotlight & zoom
  section('Settings · Spotlight & zoom');
  const PS = '#pvSpot';
  await step('Spotlight shape: circle, rounded rectangle and squircle each look different', async () => {
    await toSettings('spot'); const hs = {};
    for (const s of ['circle', 'rounded', 'squircle']) { await setControl('spot.shape', s); hs[s] = (await previewHash(PS)).h; }
    assert(new Set(Object.values(hs)).size === 3, JSON.stringify(hs)); await setControl('spot.shape', 'circle'); return '3 distinct';
  });
  await step('Spotlight size: a bigger opening dims less', async () => {
    await setControl('spot.size', 100); const a = (await previewHash(PS)).n; await setControl('spot.size', 300); const b = (await previewHash(PS)).n;
    assert(b < a, `${a} → ${b}`); await setControl('spot.size', 190); return `${a} → ${b} dimmed px`;
  });
  await step('Dim strength sets how dark the rest gets', async () => {
    await setControl('spot.dim', 0.3); await parkInPreview(PS); const a = await (await page()).evaluate(() => [...document.querySelector('#pvSpot canvas').getContext('2d').getImageData(2, 2, 1, 1).data]);
    await setControl('spot.dim', 0.8); await parkInPreview(PS); const b = await (await page()).evaluate(() => [...document.querySelector('#pvSpot canvas').getContext('2d').getImageData(2, 2, 1, 1).data]);
    assert(Math.abs(a[3] - 0.3 * 255) < 20 && Math.abs(b[3] - 0.8 * 255) < 20, `corner alpha ${a[3]}, ${b[3]}`);
    await setControl('spot.dim', 0.62); return `corner alpha ${a[3]} (30%) → ${b[3]} (80%)`;
  });
  await step('Soft edge widens the fade around the opening', async () => {
    await setControl('spot.feather', 0); await parkInPreview(PS); const a = await previewAlphaStats(PS);
    await setControl('spot.feather', 70); await parkInPreview(PS); const b = await previewAlphaStats(PS);
    assert(b.partial > a.partial * 2, `${a.partial} → ${b.partial}`); await setControl('spot.feather', 26); return `${a.partial} → ${b.partial} soft px`;
  });
  await step('Spotlight in the overlay dims to the set strength', async () => {
    await setControl('spot.dim', 0.5); await toOverlay(); await shortcut('Command+Shift+7');
    const c = await waitFor(async () => { const c = await pixelAt('fx', 5, 5); return c[3] > 50 && c; }, 'spotlight');
    assert(Math.abs(c[3] - 128) < 20, 'alpha ' + c[3]); await shortcut('Command+Shift+7');
    await toSettings('spot'); await setControl('spot.dim', 0.62); return `corner alpha ${c[3]} at 50%`;
  });
  if (captureAvailable()) {
    await step('Zoom captures exactly the area for the magnification and lens size', async () => {
      await toSettings('spot'); await setControl('zoom.level', 2); await setControl('zoom.size', 200);
      await toOverlay(); resetCaptures(); await shortcut('Command+Shift+8');
      const caps = await waitFor(async () => { const c = captures(); return c.length >= 3 && c; }, 'captures', 8000);
      const m = /-R(-?\d+),(-?\d+),(\d+),(\d+)/.exec(caps.at(-1)); assert(m && +m[3] === 100 && +m[4] === 100, 'capture ' + caps.at(-1));
      const n = await waitFor(async () => { const n = await pixels('fx'); return n > 5000 && n; }, 'lens drawn');
      await shot('zoom-lens'); await shortcut('Command+Shift+8'); return `-R …,${m[3]},${m[4]}; lens ${n} px`;
    });
    await step('Zoom lens sits beside the pointer, never on it', async () => {
      await shortcut('Command+Shift+8'); await waitFor(async () => (await pixels('fx')) > 5000, 'lens');
      const [cx, cy] = await H.app().evaluate(({ screen }) => { const p = screen.getCursorScreenPoint(); const b = global.__overmark.win().getBounds(); return [p.x - b.x, p.y - b.y]; });
      const at = await pixelAt('fx', cx, cy); assert(at[3] < 30, 'lens covers the pointer: ' + at);
      await shortcut('Command+Shift+8');
    });
    await step('Zoom magnification, lens size, shape and border change the lens', async () => {
      const lens = async () => { await toOverlay(); resetCaptures(); await shortcut('Command+Shift+8'); await waitFor(async () => (await pixels('fx')) > 3000, 'lens'); await sleep(300); const h = await canvasHash('#fx'); const c = captures().at(-1); await shortcut('Command+Shift+8'); return { ...h, c }; };
      const base = await lens();
      await toSettings('spot'); await setControl('zoom.level', 4); const lv = await lens();
      assert(/,50,50 /.test(lv.c + ' '), 'level 4 capture ' + lv.c);
      await toSettings('spot'); await setControl('zoom.size', 340); const sz = await lens(); assert(sz.n > base.n * 1.8, `size ${base.n} → ${sz.n}`);
      await toSettings('spot'); await setControl('zoom.shape', 'rounded'); const sh = await lens(); assert(sh.h !== sz.h, 'shape same');
      await toSettings('spot'); await setControl('zoom.border', false); const bd = await lens(); assert(bd.h !== sh.h, 'border same');
      await toSettings('spot'); await setControl('zoom.level', 2.5); await setControl('zoom.size', 240); await setControl('zoom.shape', 'circle'); await setControl('zoom.border', true);
      return 'level, size, shape, border all change the lens';
    });
  } else {
    await step('Zoom lens (skipped: no screencapture here; CI installs tests/fixtures/fake-screencapture.sh)', async () => 'skipped');
  }

  // ==================================================================== Shortcuts editor
  section('Shortcuts editor');
  const rec = async (id, keys) => { const p = await toSettings('keys'); await p.click(`[data-rec="${id}"]`); await sleep(100); await p.keyboard.press(keys); await sleep(200); return p.$eval('#keyMsg', (e) => e.textContent); };
  await step('Change a shortcut: ⌘⇧K is saved, registered, and the old one released', async () => {
    const msg = await rec('annotate', 'Meta+Shift+K'); assert(/Saved/.test(msg), msg);
    assert((await stored('keys2')).annotate === 'Command+Shift+K', 'not saved');
    await waitFor(async () => (await isRegistered('Command+Shift+K')) && !(await isRegistered('Command+Shift+1')), 'registration');
    await shortcut('Command+Shift+K'); await waitMode('overlay'); await waitFor(() => hasClass('drawing'), 'new shortcut draws'); await stopDraw();
    return 'starts drawing';
  });
  await step('Rejects a single modifier', async () => { const m = await rec('highlight', 'Shift+J'); assert(/two modifier/.test(m), m); await (await page()).keyboard.press('Escape'); });
  await step('Rejects ⌘⇧3, ⌘⇧4 and ⌘⇧5 (macOS screenshots)', async () => {
    for (const d of ['3', '4', '5']) { const m = await rec('highlight', `Meta+Shift+Digit${d}`); assert(/screenshots/.test(m), m); await (await page()).keyboard.press('Escape'); }
  });
  await step('Rejects Control + Option (VoiceOver)', async () => { const m = await rec('highlight', 'Control+Alt+J'); assert(/VoiceOver/.test(m), m); await (await page()).keyboard.press('Escape'); });
  await step('Rejects a shortcut another action already uses', async () => { const m = await rec('highlight', 'Meta+Shift+K'); assert(/already used for Annotate/.test(m), m); await (await page()).keyboard.press('Escape'); });
  await step('Esc cancels recording and changes nothing', async () => {
    const before = await stored('keys2'); const p = await toSettings('keys'); await p.click('[data-rec="spotlight"]'); await p.keyboard.press('Escape'); await sleep(150);
    assert(JSON.stringify(await stored('keys2')) === JSON.stringify(before), 'changed'); assert(!(await p.$('.krow.rec')), 'still recording');
  });
  await step('Whiteboard (no default) can be given a shortcut, and it works', async () => {
    const m = await rec('board', 'Meta+Shift+B'); assert(/Saved/.test(m), m);
    await waitFor(() => isRegistered('Command+Shift+B'), 'registered');
    await toOverlay(); await shortcut('Command+Shift+B');
    await waitFor(async () => (await menuItem('Whiteboard'))?.checked, 'board on'); await shortcut('Command+Shift+B');
    await waitFor(async () => !(await menuItem('Whiteboard'))?.checked, 'board off'); await stopDraw();
  });
  await step('Auto-erase can be given a shortcut, and it works', async () => {
    const m = await rec('erase', 'Meta+Shift+E'); assert(/Saved/.test(m), m); await toOverlay();
    await shortcut('Command+Shift+E'); await waitFor(async () => (await stored('cfg'))?.autoErase === true, 'erase on');
    await shortcut('Command+Shift+E'); await waitFor(async () => (await stored('cfg'))?.autoErase === false, 'erase off');
  });
  await step('× removes a shortcut', async () => {
    const p = await toSettings('keys'); await p.click('[data-unset="board"]'); await sleep(200);
    assert((await stored('keys2')).board === null, 'still saved'); await waitFor(async () => !(await isRegistered('Command+Shift+B')), 'released');
  });
  await step('Reset all to defaults', async () => {
    const p = await toSettings('keys'); await p.click('[data-do="resetkeys"]'); await sleep(250);
    const k = await stored('keys2'); assert(JSON.stringify(k) === JSON.stringify(DEFAULT_KEYS), JSON.stringify(k));
    await waitFor(async () => (await isRegistered('Command+Shift+1')) && !(await isRegistered('Command+Shift+K')) && !(await isRegistered('Command+Shift+E')), 'defaults registered');
  });
  await step('Menu bar labels show the current shortcuts', async () => {
    const it = await menuItem('Annotate screen'); assert(/⌘|Cmd|Command/.test(it.label) && /1/.test(it.label), it.label); return it.label.replace(/\s+/g, ' ');
  });

  // ==================================================================== About & reset
  section('About & reset');
  await step('About shows the app version and a working GitHub link', async () => {
    const p = await toSettings('about'); const v = await H.app().evaluate(({ app }) => app.getVersion());
    const txt = await p.innerText('#pane'); assert(txt.includes('Version ' + v), 'version: ' + txt.match(/Version [^\n]*/));
    const href = await p.$eval('#pane a[href*="overmark"]', (a) => a.getAttribute('href'));
    assert(href === 'https://github.com/thepiyushway/overmark', 'link ' + href);
    const url = p.url();
    await H.app().evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async (u) => { global.__opened.push(u); }; });
    await p.click('#pane a[href*="overmark"]'); // opens a new window, which the app hands to the browser
    const opened = await waitFor(async () => (await H.app().evaluate(() => global.__opened))[0], 'opened in the browser', 4000);
    assert(opened === 'https://github.com/thepiyushway/overmark' && p.url() === url, `opened ${opened}; page ${p.url()}`);
    return 'Version ' + v;
  });
  await step('Reset all settings restores every default', async () => {
    const p = await toSettings('about'); await p.click('[data-do="resetall"]'); await sleep(400);
    const cfg = await stored('cfg'); assert(JSON.stringify(cfg.palette) === JSON.stringify(DEFAULT_PALETTE), 'palette ' + cfg.palette);
    assert(cfg.board === 'white' && cfg.hl.shape === 'circle' && cfg.spot.dim === 0.62 && cfg.zoom.level === 2.5 && cfg.widthScale === 1 && cfg.toolbarPos === 'top', JSON.stringify(cfg));
    assert(JSON.stringify(await stored('keys2')) === JSON.stringify(DEFAULT_KEYS), 'keys');
  });

  // ==================================================================== Drawing tools and toolbar
  section('Drawing tools and toolbar');
  await step('Every tool button selects its tool', async () => {
    await toOverlay(); const p = await startDraw();
    for (const t of ['pen', 'marker', 'eraser', 'line', 'arrow', 'rect', 'ellipse', 'text', 'pen']) { await p.click(`[data-tool="${t}"]`); assert(await p.$eval(`[data-tool="${t}"]`, (b) => b.getAttribute('aria-pressed')) === 'true', t); }
    return '8 tools';
  });
  await step('Colour keys 1–6 draw in the palette colours', async () => {
    const p = await page(); const got = [];
    for (let i = 0; i < 6; i++) { await p.keyboard.press(String(i + 1)); const y = 150 + i * 40; const b = await strokeBox(p, [300, y], [600, y], [280, y - 15, 340, 30]); assert(near(b.color, hex(DEFAULT_PALETTE[i]), 48), `${i + 1}: ${b.color} vs ${DEFAULT_PALETTE[i]}`); got.push(b.color); }
    await clearInk(); return '6 colours match';
  });
  await step('Thin, medium and thick buttons, and the − = keys, change thickness', async () => {
    const p = await page(); await p.keyboard.press('1'); const h = [];
    for (let i = 0; i < 3; i++) { await p.click(`[data-width="${i}"]`); const y = 200 + i * 80; h.push((await strokeBox(p, [300, y], [700, y], [280, y - 30, 440, 60])).h); }
    assert(h[0] < h[1] && h[1] < h[2], 'buttons: ' + h);
    await p.keyboard.press('-'); const y = 500; const lo = (await strokeBox(p, [300, y], [700, y], [280, y - 30, 440, 60])).h;
    await p.keyboard.press('='); await p.keyboard.press('='); const y2 = 580; const hi = (await strokeBox(p, [300, y2], [700, y2], [280, y2 - 30, 440, 60])).h;
    assert(hi > lo, `keys ${lo} → ${hi}`); await clearInk(); return `${h.map((v) => v.toFixed(0)).join(' < ')} px`;
  });
  await step('Pen ink is solid; highlighter ink is see-through', async () => {
    const p = await page(); await p.keyboard.press('p'); const a = await strokeBox(p, [300, 300], [700, 300], [280, 270, 440, 60]);
    await p.keyboard.press('m'); const b = await strokeBox(p, [300, 400], [700, 400], [280, 370, 440, 60]);
    assert(a.maxAlpha > 240 && b.maxAlpha < 220, `pen ${a.maxAlpha}, highlighter ${b.maxAlpha}`); await clearInk(); return `alpha ${a.maxAlpha} vs ${b.maxAlpha}`;
  });
  await step('Shift snaps a line to 45°', async () => {
    const p = await page(); await p.keyboard.press('l'); await drag(p, [[300, 300], [500, 470]], { shift: true });
    const b = await inkBox(); assert(Math.abs(b.w - b.h) < 14, `w ${b.w} h ${b.h}`); await clearInk();
    await drag(p, [[300, 300], [500, 330]], { shift: true }); const c = await inkBox(); assert(c.h < 16, 'not flat: ' + c.h); await clearInk();
    return '38° → 45°, 9° → 0°';
  });
  await step('Shift makes a perfect square and a perfect circle', async () => {
    const p = await page();
    for (const t of ['r', 'o']) { await p.keyboard.press(t); await drag(p, [[300, 300], [520, 400]], { shift: true }); const b = await inkBox(); assert(Math.abs(b.w - b.h) < 8, `${t}: ${b.w}×${b.h}`); await clearInk(); }
  });
  await step('Arrow tool draws a line with a head', async () => {
    const p = await page(); await p.keyboard.press('l'); const line = await strokeBox(p, [300, 300], [700, 300]); await clearInk();
    await p.keyboard.press('a'); const arrow = await strokeBox(p, [300, 300], [700, 300]);
    assert(arrow.n > line.n && arrow.h > line.h * 3, `line ${line.n} px ${line.h.toFixed(0)} tall, arrow ${arrow.n} px ${arrow.h.toFixed(0)} tall`); await clearInk();
    return `head makes it ${arrow.h.toFixed(0)} px tall vs ${line.h.toFixed(0)} px`;
  });
  await step('Text: Enter places it, Esc cancels it', async () => {
    const p = await page(); await p.keyboard.press('t'); await p.mouse.click(400, 400); await p.keyboard.type('Overmark'); await p.keyboard.press('Enter'); await sleep(200);
    const placed = await pixels(); assert(placed > 100, 'no text');
    await p.keyboard.press('t'); await p.mouse.click(400, 600); await p.keyboard.type('cancel me'); await p.keyboard.press('Escape'); await sleep(200);
    assert((await pixels()) === placed, 'cancelled text left ink'); await clearInk(); await p.keyboard.press('p');
  });
  await step('Undo, redo and clear buttons, enabled only when they can act', async () => {
    const p = await page(); const dis = (a) => p.$eval(`[data-act="${a}"]`, (b) => b.disabled);
    await drag(p, [[300, 300], [600, 300]]); const n = await pixels(); assert(!(await dis('undo')) && !(await dis('clear')) && (await dis('redo')), 'states after drawing');
    await p.click('[data-act="undo"]'); await sleep(120); assert((await pixels()) === 0 && !(await dis('redo')), 'undo');
    await p.click('[data-act="redo"]'); await sleep(120); assert((await pixels()) === n, 'redo');
    await p.click('[data-act="clear"]'); await sleep(120); assert((await pixels()) === 0 && (await dis('clear')) && (await dis('redo')), 'clear');
  });
  await step('Undo brings back ink removed by Clear', async () => {
    const p = await page(); const dis = (a) => p.$eval(`[data-act="${a}"]`, (b) => b.disabled);
    await drag(p, [[300, 300], [600, 300]]); await drag(p, [[300, 400], [600, 400]]); const n = await pixels();
    await p.keyboard.press('x'); await sleep(120); assert((await pixels()) === 0 && !(await dis('undo')), 'undo not offered after clear');
    await p.keyboard.press('Control+z'); await sleep(150); assert((await pixels()) === n, `restored ${await pixels()} of ${n}`);
    await p.keyboard.press('x'); await drag(p, [[300, 600], [500, 600]]); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await sleep(150);
    assert((await pixels()) === 0, 'a new stroke after clearing should end the chance to restore');
    await clearInk(); return 'both strokes restored with ⌘Z';
  });
  await step('Backspace clears; F toggles auto-erase (fading ink)', async () => {
    const p = await page(); await drag(p, [[300, 300], [600, 300]]); await p.keyboard.press('Backspace'); await sleep(120); assert((await pixels()) === 0, 'backspace');
    await p.keyboard.press('f'); assert(await p.$eval('[data-act="erase"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'erase on');
    await p.keyboard.press('f'); assert(await p.$eval('[data-act="erase"]', (b) => b.getAttribute('aria-pressed')) === 'false', 'erase off');
  });
  await step('Toolbar buttons: highlight, spotlight, whiteboard, key sheet, Done', async () => {
    const p = await page(); const pressed = (a) => p.$eval(`[data-act="${a}"]`, (b) => b.getAttribute('aria-pressed'));
    await p.click('[data-act="hl"]'); assert((await pressed('hl')) === 'true', 'hl'); await waitFor(async () => (await pixels('fx')) > 100, 'hl drawn'); await p.click('[data-act="hl"]');
    await p.click('[data-act="spot"]'); assert((await pressed('spot')) === 'true', 'spot'); await waitFor(async () => (await pixels('fx')) > 100000, 'spot drawn'); await p.click('[data-act="spot"]');
    await p.click('[data-act="board"]'); assert((await pressed('board')) === 'true', 'board'); await p.click('[data-act="board"]');
    await p.click('[data-act="help"]'); assert(!(await p.$eval('#cheat', (c) => c.hidden)), 'sheet'); await p.keyboard.press('/');
    await p.click('[data-act="done"]'); await waitFor(async () => !(await hasClass('drawing')), 'done');
  });
  await step('H, S and B keys toggle highlight, spotlight and whiteboard', async () => {
    const p = await startDraw(); const pressed = (a) => p.$eval(`[data-act="${a}"]`, (b) => b.getAttribute('aria-pressed'));
    for (const [k, a] of [['h', 'hl'], ['s', 'spot'], ['b', 'board']]) { await p.keyboard.press(k); assert((await pressed(a)) === 'true', a + ' on'); await p.keyboard.press(k); assert((await pressed(a)) === 'false', a + ' off'); }
  });
  await step('The toolbar can be dragged somewhere else', async () => {
    const p = await page(); const g = await (await p.$('[data-grip]')).boundingBox(); const before = await p.$eval('#bar', (b) => b.getBoundingClientRect().toJSON());
    await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down(); await p.mouse.move(g.x + 300, g.y + 400, { steps: 8 }); await p.mouse.up();
    const after = await p.$eval('#bar', (b) => b.getBoundingClientRect().toJSON());
    assert(Math.abs(after.top - before.top - 400) < 30 && Math.abs(after.left - before.left - 300 + g.width / 2 - g.width / 2) < 40, `moved ${after.left - before.left}, ${after.top - before.top}`);
    return `moved by ${Math.round(after.left - before.left)}, ${Math.round(after.top - before.top)}`;
  });
  await step('The whiteboard keeps its own ink, separate from the screen', async () => {
    const p = await page(); await p.keyboard.press('p'); await p.keyboard.press('1');
    await drag(p, [[300, 300], [600, 300]]); const screenInk = await pixels();
    await p.keyboard.press('b'); await sleep(200); await drag(p, [[300, 700], [600, 700]]); const onBoard = await pixelAt('ink', 450, 700);
    assert(onBoard[0] > 200 && onBoard[1] < 100, 'board stroke ' + onBoard);
    await p.keyboard.press('b'); await sleep(200); assert((await pixels()) === screenInk, 'screen ink changed');
    await p.keyboard.press('b'); await sleep(200); assert(near((await pixelAt('ink', 450, 700)).slice(0, 3), onBoard.slice(0, 3), 10), 'board ink lost');
    await p.keyboard.press('b'); await clearInk(); await stopDraw();
  });

  // ==================================================================== Eraser
  section('Eraser');
  // Start from a fresh overlay: an earlier step dragged the toolbar into the middle of the screen.
  await stopDraw(); await toSettings('general'); await toOverlay();
  await step('E selects the eraser; it removes only the part it passes over', async () => {
    const p = await startDraw(); await p.keyboard.press('p'); await p.keyboard.press('1'); await p.click('[data-width="1"]');
    await drag(p, [[200, 300], [1000, 300]]); const before = await pixels();
    await p.keyboard.press('e'); assert(await p.$eval('[data-tool="eraser"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'E did not select the eraser');
    await p.click('[data-width="1"]'); await drag(p, [[600, 220], [600, 380]]);
    const after = await pixels(), gap = await gapAt(300, 600);
    assert(after < before && after > before * 0.8, `ink ${before} → ${after}`); assert(gap > 20, 'no gap: ' + gap);
    assert((await pixelAt('ink', 300, 300))[3] > 200 && (await pixelAt('ink', 900, 300))[3] > 200, 'erased too much');
    return `${gap.toFixed(0)} px gap, rest of the line kept`;
  });
  await step('Eraser sizes: small, medium and large cut 16, 36 and 80 px', async () => {
    const p = await page(); const gaps = [];
    for (const [i, y] of [[0, 420], [1, 500], [2, 580]]) {
      await p.keyboard.press('p'); await drag(p, [[200, y], [1000, y]]); await p.keyboard.press('e'); await p.click(`[data-width="${i}"]`);
      await drag(p, [[600, y - 70], [600, y + 70]]); gaps.push(await gapAt(y, 600));
    }
    [16, 36, 80].forEach((want, i) => assert(Math.abs(gaps[i] - want) <= 8, `size ${i}: ${gaps[i]} px, want ≈${want}`));
    await clearInk(); return gaps.map((g) => g.toFixed(0) + ' px').join(', ');
  });
  await step('− and = change the eraser size', async () => {
    const p = await page(); await p.keyboard.press('e'); await p.click('[data-width="1"]');
    await p.keyboard.press('='); assert(await p.$eval('[data-width="2"]', (b) => b.getAttribute('aria-pressed')) === 'true', '= did not grow it');
    await p.keyboard.press('-'); await p.keyboard.press('-'); assert(await p.$eval('[data-width="0"]', (b) => b.getAttribute('aria-pressed')) === 'true', '− did not shrink it');
  });
  await step('A ring at the pointer shows the eraser size (not over the toolbar)', async () => {
    const p = await page(); await p.keyboard.press('e'); await p.click('[data-width="2"]');
    await p.mouse.move(700, 450); await p.mouse.move(720, 460, { steps: 3 });
    const ring = await waitFor(async () => { const b = await inkBox('fx', [620, 360, 200, 200]); return b.n > 50 && b; }, 'ring drawn');
    assert(Math.abs(ring.w - 82) < 8 && Math.abs(ring.h - 82) < 8, `ring ${ring.w}×${ring.h}`);
    const tb = await (await p.$('[data-tool="pen"]')).boundingBox(); await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await sleep(150);
    assert((await inkBox('fx', [tb.x - 60, Math.max(0, tb.y - 60), 120, 120])).n === 0, 'ring drawn over the toolbar');
    await p.mouse.move(720, 460); await p.keyboard.press('p'); await sleep(150); assert((await inkBox('fx', [620, 360, 200, 200])).n === 0, 'ring stays with the pen');
    return `${ring.w.toFixed(0)} px ring for the 80 px eraser`;
  });
  await step('Erasing can be undone and redone', async () => {
    const p = await page(); await p.keyboard.press('p'); await drag(p, [[200, 300], [1000, 300]]); const full = await pixels();
    await p.keyboard.press('e'); await drag(p, [[600, 220], [600, 380]]); const cut = await pixels();
    await p.keyboard.press('Control+z'); await sleep(120); assert((await pixels()) === full, 'undo did not restore');
    await p.keyboard.press('Control+Shift+z'); await sleep(120); assert((await pixels()) === cut, 'redo did not erase again');
    await clearInk();
  });
  await step('The eraser works on highlighter ink and text too', async () => {
    const p = await page(); await p.keyboard.press('m'); await drag(p, [[200, 300], [1000, 300]]);
    await p.keyboard.press('t'); await p.mouse.click(400, 450); await p.keyboard.type('Erase me'); await p.keyboard.press('Enter'); await sleep(150);
    const before = await pixels(); await p.keyboard.press('e'); await p.click('[data-width="2"]');
    await drag(p, [[600, 240], [600, 360]]); await drag(p, [[380, 480], [700, 480]]);
    const after = await pixels(); assert(after < before * 0.9, `${before} → ${after}`); await clearInk(); return `${before} → ${after} px`;
  });
  await step('The eraser never cuts through the whiteboard', async () => {
    const p = await page(); await p.keyboard.press('b'); await sleep(200); await p.keyboard.press('p'); await drag(p, [[200, 300], [1000, 300]]);
    await p.keyboard.press('e'); await p.click('[data-width="2"]'); await drag(p, [[600, 220], [600, 380]]);
    const c = await pixelAt('ink', 600, 300); assert(c[3] === 255 && c[0] > 235 && c[1] > 235, 'hole in the board: ' + c);
    const ink = await pixelAt('ink', 300, 300); assert(ink[0] > 200 && ink[1] < 120, 'ink gone: ' + ink);
    await p.keyboard.press('b'); await clearInk(); return 'board intact under the erased gap';
  });
  await step('With auto-erase on, erased ink never comes back while the rest fades', async () => {
    await stopDraw(); await toSettings('annotate'); await setControl('eraseAfter', 2); await setControl('autoErase', true);
    const p = await toOverlay(); await startDraw(); await p.keyboard.press('p'); await drag(p, [[200, 300], [1000, 300]]);
    await p.keyboard.press('e'); await p.click('[data-width="1"]'); await drag(p, [[600, 220], [600, 380]]);
    for (let i = 0; i < 8; i++) { assert((await pixelAt('ink', 600, 300))[3] < 40, `erased gap reappeared after ${i * 0.4}s`); await sleep(400); }
    await waitFor(async () => (await pixels()) === 0, 'everything faded', 6000);
    await stopDraw(); await toSettings('annotate'); await setControl('autoErase', false); await setControl('eraseAfter', 3);
  });

  // ==================================================================== Sizes, colours and pressure
  section('Sizes, colours and pressure');
  await step('Each tool remembers its own size', async () => {
    const p = await toOverlay(); await startDraw(); const pressed = async () => p.$eval('[data-width][aria-pressed="true"]', (b) => +b.dataset.width);
    await p.keyboard.press('p'); await p.click('[data-width="2"]'); await p.keyboard.press('m'); await p.click('[data-width="0"]'); await p.keyboard.press('e'); await p.click('[data-width="1"]');
    await p.keyboard.press('p'); assert((await pressed()) === 2, 'pen'); await p.keyboard.press('m'); assert((await pressed()) === 0, 'highlighter'); await p.keyboard.press('e'); assert((await pressed()) === 1, 'eraser');
    await p.keyboard.press('p'); const pen = await strokeBox(p, [300, 300], [800, 300]); await p.keyboard.press('m'); const hl = await strokeBox(p, [300, 500], [800, 500], [280, 440, 540, 120]);
    assert(pen.h > 8, 'thick pen ' + pen.h); await clearInk(); return `pen thick (${pen.h.toFixed(0)} px), highlighter thin, eraser medium`;
  });
  await step('The 8th swatch opens 24 quick colours; picking one draws in it', async () => {
    const p = await page(); await p.click('[data-picker]');
    const n = await waitFor(async () => !(await p.$eval('#picker', (e) => e.hidden)) && (await p.$$('#picker [data-pick]')).length, 'picker open');
    assert(n === 24, n + ' colours'); await p.click('#picker [data-pick="#00c7be"]');
    assert(await p.$eval('#picker', (e) => e.hidden), 'picker stayed open');
    assert(await p.$eval('[data-color="7"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'custom not selected');
    await p.keyboard.press('p'); const b = await strokeBox(p, [300, 300], [800, 300]); assert(near(b.color, [0, 199, 190], 40), 'ink ' + b.color);
    assert((await stored('cfg')).customColor === '#00c7be', 'not saved'); await clearInk(); return 'teal from the picker';
  });
  await step('Esc and clicking elsewhere close the picker; key 8 picks the custom colour', async () => {
    const p = await page(); await p.click('[data-picker]'); await p.keyboard.press('Escape'); assert(await p.$eval('#picker', (e) => e.hidden), 'Esc'); assert(await hasClass('drawing'), 'Esc should only close the picker');
    await p.click('[data-picker]'); await p.mouse.click(700, 650); assert(await p.$eval('#picker', (e) => e.hidden), 'click outside');
    await p.keyboard.press('1'); await p.keyboard.press('8'); assert(await p.$eval('[data-color="7"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'key 8'); await clearInk();
  });
  await step('Settings → Annotate → Custom colour changes the swatch and the ink', async () => {
    await stopDraw(); await toSettings('annotate'); await setControl('customColor', '#ff00ff');
    const p = await toOverlay(); await startDraw(); await p.keyboard.press('8'); await p.keyboard.press('p');
    const b = await strokeBox(p, [300, 300], [800, 300]); assert(near(b.color, [255, 0, 255], 40), 'ink ' + b.color); await clearInk();
  });
  await step('Stylus pressure: a harder press draws a thicker line (mouse strokes unaffected)', async () => {
    const p = await page(); await p.keyboard.press('p'); await p.keyboard.press('1'); await p.click('[data-width="1"]');
    await penStroke(p, 300, 0.1); const light = (await inkBox('ink', [280, 270, 540, 60])).h;
    await penStroke(p, 450, 1.0); const hard = (await inkBox('ink', [280, 420, 540, 60])).h;
    const mouse = (await strokeBox(p, [300, 600], [800, 600], [280, 570, 540, 60])).h;
    assert(hard > light * 2, `light ${light}, hard ${hard}`); assert(Math.abs(mouse - 6) < 4, 'mouse width ' + mouse);
    await clearInk(); return `light ${light.toFixed(0)} px, hard ${hard.toFixed(0)} px, mouse ${mouse.toFixed(0)} px`;
  });

  // ==================================================================== Screenshot
  section('Screenshot');
  const desktop = async () => H.app().evaluate(({ app }) => app.getPath('desktop'));
  const shots = async () => { const fs = require('fs'); try { return fs.readdirSync(await desktop()).filter((f) => /^Overmark .*\.png$/.test(f)); } catch { return []; } };
  if (captureAvailable()) {
    await step('The toolbar button saves the screen with ink to the Desktop, hiding the toolbar while it captures', async () => {
      const p = await page(); await drag(p, [[300, 300], [800, 300]]); resetCaptures(); const n0 = (await shots()).length;
      await p.click('[data-act="shot"]');
      const during = await waitFor(async () => (await hasClass('capturing')) && (await p.$eval('#bar', (b) => getComputedStyle(b).visibility)), 'capturing', 2000);
      assert(during === 'hidden', 'toolbar visible during capture'); assert((await pixels()) > 0, 'ink hidden during capture');
      const t = await waitFor(async () => { const t = await hudText(); return /Screenshot saved/.test(t) && t; }, 'saved notice', 8000);
      const files = await shots(); assert(files.length === n0 + 1, 'files ' + files);
      const w = await winState(); const cap = captures().at(-1);
      assert(cap.includes('-t png') && cap.includes(`-R${w.bounds.x},${w.bounds.y},${w.bounds.width},${w.bounds.height}`), 'capture ' + cap);
      assert(!(await hasClass('capturing')) && (await toolbarShown()), 'toolbar not back');
      await shot('screenshot-notice'); return `${files.at(-1)}; "${t.replace(/\s+/g, ' ')}"`;
    });
    await step('It is copied to the clipboard', async () => {
      const empty = await H.app().evaluate(({ clipboard }) => clipboard.readImage().isEmpty()); assert(!empty, 'clipboard has no image');
    });
    await step('C key and the menu bar item take screenshots too; quick repeats never overwrite each other', async () => {
      const p = await page(); const n0 = (await shots()).length;
      await p.keyboard.press('c'); await waitFor(async () => (await shots()).length === n0 + 1, 'C key', 8000);
      await stopDraw(); await menuClick('Take screenshot'); await waitFor(async () => (await shots()).length === n0 + 2, 'menu item', 8000);
    });
    await step('Screenshot can have its own global shortcut', async () => {
      const n0 = (await shots()).length; const m = await rec('shot', 'Meta+Shift+P'); assert(/Saved/.test(m), m);
      await waitFor(() => isRegistered('Command+Shift+P'), 'registered'); await toOverlay(); await shortcut('Command+Shift+P');
      await waitFor(async () => (await shots()).length === n0 + 1, 'shortcut screenshot', 8000);
      const k = await toSettings('keys'); await k.click('[data-do="resetkeys"]'); await sleep(200);
    });
    await step('If macOS blocks capture, Overmark says what to allow and opens Screen Recording settings (once)', async () => {
      const fs = require('fs'); fs.writeFileSync(DENY, '1');
      await H.app().evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async (u) => { global.__opened.push(u); }; });
      try {
        await toOverlay(); const p = await startDraw(); const n0 = (await shots()).length;
        await p.keyboard.press('c');
        const t = await waitFor(async () => { const t = await hudText(); return /Screenshots need Screen Recording/.test(t) && t; }, 'guidance', 8000);
        assert(/Allow Overmark/.test(t), 'names the wrong app: ' + t);
        const opened = await waitFor(async () => (await H.app().evaluate(() => global.__opened))[0], 'settings opened', 4000);
        assert(/Privacy_ScreenCapture/.test(opened), 'opened ' + opened); assert((await shots()).length === n0, 'a file was written anyway');
        await stopDraw(); await shortcut('Command+Shift+8');
        await waitFor(async () => /Zoom needs Screen Recording/.test(await hudText()), 'zoom guidance', 8000);
        await waitFor(async () => !(await menuItem('Zoom')).checked, 'zoom switched off');
        assert((await H.app().evaluate(() => global.__opened)).length === 1, 'System Settings opened more than once');
        return t.replace(/\s+/g, ' ');
      } finally { fs.rmSync(DENY, { force: true }); }
    });
    await step('The menu item is unavailable in the Settings window', async () => { await toSettings('general'); assert(!(await menuItem('Take screenshot')).enabled, 'enabled in Settings'); });
  } else {
    await step('Screenshot (skipped: no screencapture here; CI installs tests/fixtures/fake-screencapture.sh)', async () => 'skipped');
  }

  // ==================================================================== Toolbar
  section('Toolbar');
  const visible = async (sel) => (await page()).$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.color ?? e.dataset.tool ?? e.dataset.act ?? e.dataset.width));
  await step('Default toolbar: red, yellow, blue and green, plus the colour picker', async () => {
    await stopDraw(); await toSettings('general'); const p = await toOverlay(); await startDraw();
    const cols = await visible('#bar [data-color]'); assert(JSON.stringify(cols) === JSON.stringify(['0', '1', '2', '3', '7']), 'visible colours ' + cols);
    const bg = await p.$$eval('#bar [data-color] .sw', (els) => els.slice(0, 4).map((e) => getComputedStyle(e).backgroundColor));
    assert(JSON.stringify(bg) === JSON.stringify(['rgb(255, 59, 48)', 'rgb(255, 214, 10)', 'rgb(10, 132, 255)', 'rgb(48, 209, 88)']), 'colours ' + bg);
    await p.keyboard.press('5'); assert(await p.$eval('[data-color="4"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'key 5 (hidden orange) still works');
    await p.keyboard.press('1'); await stopDraw(); return 'red, yellow, blue, green + picker; orange/white/gradient by key';
  });
  await step('Settings → Toolbar lists every item with a switch, and a live preview', async () => {
    const p = await toSettings('toolbar'); const n = (await p.$$('[data-bar]')).length;
    assert(n === 29, n + ' switches'); assert(await p.$('#barPreview [data-tool="pen"]'), 'no preview');
    assert(await p.$eval('[data-bar="color:6"]', (e) => !e.checked) && await p.$eval('[data-bar="tool:eraser"]', (e) => e.checked), 'default states');
    return n + ' items: tools, colours, sizes, edit, modes and effects';
  });
  await step('Hiding items removes them from the toolbar and preview; their keys still work', async () => {
    const p = await page();
    for (const id of ['tool:eraser', 'act:zoom', 'act:help']) await p.click(`[data-bar="${id}"] + span`);
    assert(await p.$eval('#barPreview [data-tool="eraser"]', (b) => b.hidden), 'preview still shows the eraser');
    assert(JSON.stringify((await stored('barHidden')).sort()) === JSON.stringify([...DEFAULT_BAR_HIDDEN, 'tool:eraser', 'act:zoom', 'act:help'].sort()), 'not saved');
    const q = await toOverlay(); await startDraw();
    const tools = await visible('#bar [data-tool]'), acts = await visible('#bar [data-act]');
    assert(!tools.includes('eraser') && !acts.includes('zoom') && !acts.includes('help'), `still visible: ${tools} ${acts}`);
    await q.keyboard.press('p'); await drag(q, [[300, 300], [900, 300]]); const before = await pixels();
    await q.keyboard.press('e'); await drag(q, [[600, 220], [600, 380]]); assert((await pixels()) < before, 'E (hidden eraser) did not erase');
    await clearInk(); await q.keyboard.press('p'); await stopDraw(); return 'eraser, zoom and help hidden; E still erases';
  });
  await step('Showing a hidden item adds it back (gradient ink)', async () => {
    const p = await toSettings('toolbar'); await p.click('[data-bar="color:6"] + span');
    assert(!(await p.$eval('#barPreview [data-color="6"]', (b) => b.hidden)), 'preview');
    await toOverlay(); await startDraw(); assert((await visible('#bar [data-color]')).includes('6'), 'gradient not on the toolbar'); await stopDraw();
  });
  await step('Separators appear only between groups that still show something', async () => {
    const p = await toSettings('toolbar'); const seps = () => p.$$eval('#barPreview .sep', (s) => s.length); const before = await seps();
    for (const id of ['act:undo', 'act:redo', 'act:clear']) await p.click(`[data-bar="${id}"] + span`);
    const after = await seps(); assert(after === before - 1, `${before} → ${after}`);
    for (const id of ['act:undo', 'act:redo', 'act:clear']) await p.click(`[data-bar="${id}"] + span`);
    return `${before} → ${after} separators with Edit hidden`;
  });
  await step('Reset toolbar to the default', async () => {
    const p = await page(); await p.click('[data-do="resetbar"]'); await sleep(200);
    assert(JSON.stringify((await stored('barHidden')).sort()) === JSON.stringify([...DEFAULT_BAR_HIDDEN].sort()), 'stored ' + JSON.stringify(await stored('barHidden')));
    assert(!(await p.$eval('#barPreview [data-tool="eraser"]', (b) => b.hidden)) && (await p.$eval('#barPreview [data-color="6"]', (b) => b.hidden)), 'preview not reset');
  });

  // ==================================================================== Menu bar menu
  section('Menu bar menu');
  await step('Annotate screen ↔ Stop annotating follows the state; Interactive mode only while drawing', async () => {
    assert(await menuItem('Annotate screen'), 'idle label'); assert(!(await menuItem('Interactive mode')).enabled, 'interactive enabled while idle');
    await menuClick('Annotate screen'); await waitFor(() => hasClass('drawing'), 'drawing');
    await waitFor(async () => await menuItem('Stop annotating'), 'drawing label'); assert((await menuItem('Interactive mode')).enabled, 'interactive disabled while drawing');
    const p = await page(); await drag(p, [[300, 300], [600, 300]]);
    await menuClick('Interactive mode'); await waitFor(async () => !(await hasClass('drawing')), 'interactive'); assert((await pixels()) > 0, 'ink lost');
  });
  await step('Clear ink is enabled only when there is ink, and clears it', async () => {
    assert((await menuItem('Clear ink')).enabled, 'disabled with ink'); await menuClick('Clear ink');
    await waitFor(async () => (await pixels()) === 0, 'cleared'); await waitFor(async () => !(await menuItem('Clear ink')).enabled, 'disabled after');
  });
  await step('Annotate without controls', async () => {
    await menuClick('Annotate without controls'); await waitFor(() => hasClass('drawing'), 'drawing'); assert(!(await toolbarShown()), 'toolbar shown'); await stopDraw();
  });
  await step('Whiteboard, Highlight, Spotlight and Auto-erase are ticked when on', async () => {
    for (const label of ['Whiteboard', 'Highlight cursor', 'Spotlight', 'Auto-erase ink']) {
      await menuClick(label); await waitFor(async () => (await menuItem(label)).checked, label + ' ticked');
      await menuClick(label); await waitFor(async () => !(await menuItem(label)).checked, label + ' unticked');
    }
    await stopDraw(); return '4 toggles';
  });
  if (captureAvailable()) await step('Zoom is ticked when on and draws the lens', async () => {
    await menuClick('Zoom'); await waitFor(async () => (await menuItem('Zoom')).checked && (await pixels('fx')) > 3000, 'zoom on');
    await menuClick('Zoom'); await waitFor(async () => !(await menuItem('Zoom')).checked, 'zoom off');
  });
  await step('Show shortcuts lists the keys on screen', async () => {
    await menuClick('Show shortcuts'); const t = await waitFor(async () => { const t = await hudText(); return /draw/.test(t) && t; }, 'key list'); return t.replace(/\s+/g, ' ').slice(0, 50);
  });
  await step('Open at login', async () => {
    if (process.platform !== 'darwin') return 'skipped: login items are a macOS feature';
    const before = await H.app().evaluate(({ app }) => app.getLoginItemSettings().openAtLogin);
    await menuClick('Open at login'); const after = await H.app().evaluate(({ app }) => app.getLoginItemSettings().openAtLogin);
    assert(after !== before, 'unchanged'); await menuClick('Open at login');
  });

  // ==================================================================== Updates, as people see them
  section('Updates, as people see them');
  await step('A new release shows in Settings with an Install button', async () => {
    fake.releases = [release('v9.9.0')]; await toSettings('general'); await upd('check');
    const p = await page();
    const t = await waitFor(async () => { const b = await p.$('#updBtn'); return b && (await b.isVisible()) && (await b.innerText()); }, 'install button');
    assert(/9\.9\.0/.test(t), t); assert(/Update available: Overmark 9\.9\.0/.test(await p.innerText('#status2')), 'banner');
    await shot('update-banner'); return t;
  });
  await step('…and once on screen during a presentation', async () => {
    await toOverlay(); const t = await waitFor(async () => { const t = await hudText(); return /9\.9\.0 is available/.test(t) && t; }, 'on-screen notice (after the welcome tip)', 12000);
    await menuClick('Reload Overmark'); await waitMode('overlay'); await sleep(8500);
    assert(!/9\.9\.0/.test(await hudText()), 'shown again after reload');
    return t.replace(/\s+/g, ' ');
  });
  await step('…and in the menu bar menu', async () => {
    await waitFor(async () => await menuItem('Install update (version 9.9.0)'), 'menu item'); fake.releases = []; await upd('check');
  });

  // ==================================================================== Settings survive a restart
  section('Settings survive a restart');
  await step('Settings, shortcuts, tool and colour are kept after quitting', async () => {
    const p = await toSettings('annotate'); await setControl('palette.2', '#123456');
    await openTab('cursor'); await setControl('hl.shape', 'squircle');
    await toSettings('keys'); await (await page()).click('[data-rec="spotlight"]'); await (await page()).keyboard.press('Meta+Shift+L'); await sleep(200);
    const tb = await toSettings('toolbar'); await tb.click('[data-bar="act:board"] + span');
    await toOverlay(); const q = await startDraw(); await q.keyboard.press('a'); await q.keyboard.press('3'); await stopDraw();
    await menuClick('Quit Overmark'); await sleep(1500);
    await H.launch(); await waitMode('overlay'); await waitFor(() => isRegistered('Command+Shift+L'), 'shortcut after restart');
    const cfg = await stored('cfg'); assert(cfg.palette[2] === '#123456' && cfg.hl.shape === 'squircle', JSON.stringify({ p: cfg.palette[2], s: cfg.hl.shape }));
    const r = await startDraw();
    assert(await r.$eval('[data-tool="arrow"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'tool not kept');
    assert(await r.$eval('[data-color="2"]', (b) => b.getAttribute('aria-pressed')) === 'true', 'colour not kept');
    assert((await stored('barHidden')).includes('act:board') && await r.$eval('[data-act="board"]', (b) => b.hidden), 'toolbar choice not kept');
    await stopDraw(); return 'palette, highlight shape, ⌘⇧L, arrow tool, colour 3, toolbar';
  });

  await H.quit();
  process.exit(H.finish('Feature suite') ? 1 : 0);
})().catch(async (e) => { console.error('FATAL', e); await H.quit(); process.exit(2); });
