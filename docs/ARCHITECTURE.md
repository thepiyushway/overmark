# Architecture

```
index.html  (single file: UI, drawing engine, overlay, settings, shortcuts)
   │  window.claude.use("desktop")
   ├── Claude desktop app  ── Claude app ("Install as Mac app")
   └── desktop/preload.js ⇄ desktop/main.js (Electron) ── standalone DMG
```

## Three modes from one page
| Mode | When | What it shows |
|---|---|---|
| `page` | In a browser or Claude's artifact panel | Landing page with a live demo window to draw on, and an Install button |
| `setup` | Desktop window with a normal title bar | Tabbed Settings |
| `overlay` | Desktop window with `transparent`, `frame:false`, `alwaysOnTop` | A full-screen sheet you can click through; the toolbar appears while drawing |

Switching between `setup` and `overlay` calls `window.setOptions`, which rebuilds the window and reloads the page. `applyOptions()` caps how many times that can happen in a row, so a mismatch can't cause an endless reload loop.

## Overlay mechanics
- **Click-through:** `setIgnoreMouseEvents(true, {forward: true})` while idle. Pointer moves are still forwarded, so the cursor effects can follow.
- **Pointer position:** forwarded `pointermove` events, plus a ~60 Hz `screen.getCursorScreenPoint()` poll while an effect is on.
- **Visibility:** the window is shown only when there is something to show: drawing, ink, whiteboard, a cursor effect or a status pill. Otherwise it's hidden, so the overlay costs nothing.
- **Keyboard hand-back:** after **Esc**, the window hides and reappears without focus, so typing goes straight back to your app.
- **Canvases:** two layers. `#ink` holds strokes and the whiteboard and redraws only when something changes. `#fx` holds the highlight, spotlight and lens and redraws every frame while one is on. The spotlight uses `destination-out` with a shadow blur for its soft edge.
- **Zoom:** `screencapture -x -t jpg -R x,y,s,s` captures a square of side `lens/zoom` around the pointer. The file is read back as base64 and drawn into the lens, which sits beside the pointer so it never captures itself.

## Bugs found while building, and their fixes
| Symptom | Cause | Fix |
|---|---|---|
| The overlay was an opaque dark sheet | The page declared `color-scheme: dark` and the host window didn't, so Chromium paints an opaque backdrop behind the iframe | Force `color-scheme: light` in overlay mode |
| Shortcuts never fired | `Control+Option+…` combinations are VoiceOver chords and the platform rejects them (`EINVAL`) | Defaults moved to ⌘⇧, and the recorder rejects these chords |
| The toolbar was cut off under the menu bar | The window was sized to `display.bounds`, and macOS clamped it below the menu bar while keeping y = 0 | Size the window to `display.workArea` |
| Settings buttons couldn't be clicked | The platform drag strip (`dragHeight: 52`) covered the header buttons | `dragHeight: 12` plus `app-region: no-drag` on controls |
| Strokes weren't saved | Releases could arrive somewhere other than the canvas | End strokes on `pointerup` anywhere in the window, `lostpointercapture`, `blur`, and the next press |

## Diagnostics (Claude-app build)
`track(event)` records state changes and events, never content, to `data/users/<id>/diag` in the artifact's database. That record is private to each person. It's how the bugs above were found on a real Mac without guessing.

## Standalone shim
`desktop/preload.js` exposes `window.claude.use("desktop")` with the same shape as Claude's API. Every call goes over a single `ipcRenderer.invoke('om', method, args)` channel to `desktop/main.js`. Shortcut and menu callbacks stay in the renderer and are triggered by id. `window.setOptions` saves the options and rebuilds the `BrowserWindow`. The app hides its Dock icon (`LSUIElement`) and stays in the menu bar when its windows close.
