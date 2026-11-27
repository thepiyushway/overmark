# Testing

Two automated suites run on every release (see `.github/workflows/release.yml`). The release is published only if both pass.

## 1. Standalone app, end to end: `tests/standalone_e2e.js`
This launches the **real downloadable app**: Electron, `desktop/main.js`, `desktop/preload.js` and the bundled page, starting from a fresh install. It drives the app the way a person would. Global shortcuts and menu bar clicks are delivered the way macOS delivers them, from the main process to the page, because a synthetic key press can't reach a system-wide hotkey. Updates are tested against a local stand-in for GitHub Releases that serves real files and checksums.

```bash
cd desktop && npm install
npm test                                     # macOS
xvfb-run -a -s "-screen 0 1440x900x24" npm test   # Linux / CI
```

Latest results (33/33, Linux under Xvfb, 4 runs in a row with no failures):

| # | Step | Result |
|---|---|---|
| 1 | First launch opens the Settings window (not an invisible menu bar app) | ✅ 940×760 |
| 2 | Works offline: no internet requests, bundled font loaded | ✅ weights 400/500/600/700/800 |
| 3 | Settings: every tab renders; About credits thepiyushway; no Claude-only sections | ✅ general, annotate, cursor, spot, keys, about |
| 4 | Settings → About → "Check for updates" reports a new version | ✅ shown |
| 5 | Menu bar item is created with every action | ✅ 16 items |
| 6 | "Run in menu bar" switches to the click-through overlay covering the screen | ✅ 1440×900, always on top |
| 7 | Global shortcuts registered (6) | ✅  |
| 8 | ⌘⇧1 starts drawing: window shown, takes the mouse, toolbar visible | ✅ focused |
| 9 | Pen stroke is drawn and kept | ✅ 3439 px |
| 10 | Box, circle, arrow and line tools draw | ✅  |
| 11 | Undo and redo | ✅  |
| 12 | Colour and gradient keys | ✅  |
| 13 | Text tool places text | ✅  |
| 14 | / shows the key sheet, any key hides it | ✅  |
| 15 | Esc hands the mouse back and keeps the ink on screen | ✅  |
| 16 | Whiteboard from the menu bar opens ready to draw; closing it returns to screen ink | ✅  |
| 17 | Highlight cursor (⌘⇧2) draws around the pointer, and turns off | ✅ 4630 px |
| 18 | Spotlight (⌘⇧7) dims the screen except the pointer, and turns off | ✅ 1267822 px dimmed |
| 19 | Zoom (⌘⇧8): lens on a Mac; elsewhere it switches itself off cleanly | ✅ no screencapture on linux: stopped with "Zoom couldn't capture the screen. Allow …" |
| 20 | Security: the page can only run the zoom capture and only touch the temp folder | ✅  |
| 21 | Clear ink (⌘⇧0) empties the screen and hides the overlay | ✅  |
| 22 | Annotate without controls (⌘⇧9): drawing with the toolbar hidden | ✅  |
| 23 | Reload from the menu bar: page restarts in menu bar mode with shortcuts | ✅  |
| 24 | Opening the app again while it runs shows Settings | ✅  |
| 25 | Closing the Settings window keeps Overmark running; ⌘⇧1 still works | ✅  |
| 26 | Settings… from the menu bar | ✅  |
| 27 | Updates: no newer release → "up to date" | ✅ running 1.0.0-beta.1 |
| 28 | Updates: when up to date the menu offers "Check for updates…" | ✅  |
| 29 | Updates: a newer release is found and offered in the menu | ✅ offers 1.0.0 |
| 30 | Updates: the download is verified against SHA256SUMS.txt | ✅ checksum OK |
| 31 | Updates: a tampered download is refused | ✅  |
| 32 | Quit from the menu bar exits the app | ✅  |
| 33 | Next launch starts quietly in the menu bar with shortcuts on (a short shortcuts pill, no window) | ✅  |

On Linux the zoom step checks that zoom fails safely, because there's no `screencapture`. On a Mac the same step checks that the lens is drawn.

## 2. Web app smoke test: `tests/smoke_test.py`
Headless Chromium runs `index.html` against a mock of the Claude desktop API. It covers the landing page (light, dark, 390 px), every Settings tab, the shortcut recorder, the zoom permission check, overlay drawing, Esc, the zoom loop and diagnostics.

```bash
pip install playwright pillow && python -m playwright install chromium
python tests/smoke_test.py      # prints ALL SMOKE TESTS PASSED
```

## 3. The packaged Mac app (CI, macOS runner)
After building, the workflow checks both apps (Apple Silicon and Intel):
- `codesign --verify --deep --strict` passes on each;
- each is a menu-bar-only app (`LSUIElement`);
- the Apple Silicon app launches and stays running for 20 seconds;
- `hdiutil verify` passes on each DMG.

## Bugs these tests caught before release
| Bug | Fix |
|---|---|
| A fresh download opened silently into the menu bar, with no window and no Dock icon, so it looked broken | First launch opens Settings |
| Opening the app again while it was running did nothing | Opening it again shows Settings |
| A menu bar click was lost if the menu changed while open, for example when zoom switched itself off | Callbacks from recent menus are kept |
| The interface font came from Google, so offline it fell back to a system font | Font bundled with the app |
| Zoom retried for about 1.6 s when the capture tool couldn't run, and its message said "Allow Claude" | Stops on the first such failure, and names Overmark |
| The page could ask the app to run any command or read any file | Only the zoom capture and the temp folder are allowed |
