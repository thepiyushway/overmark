# Testing

Every push to `main` and every pull request runs all of this (`.github/workflows/tests.yml`). Releases run it again first, so nothing ships without passing.

| Suite | What it drives | Steps |
|---|---|---|
| `tests/standalone_e2e.js`: user flow | The real downloadable app (Electron + `desktop/main.js` + `desktop/preload.js` + the bundled page), from a fresh install to quitting and relaunching, including updates | 33 |
| `tests/features_e2e.js`: every feature | Every setting, drawing tool (eraser included), toolbar button, colour picker, stylus pressure, screenshot, shortcut-editor rule, menu bar item and update notice, each checked by what it does on screen | 87 |
| `tests/smoke_test.py`: web page | `index.html` in Chromium against a mock of the Claude desktop API (the Claude-app edition) | 1 run, many checks |
| CI build checks (macOS) | The packaged apps: signature, menu-bar-only, version, launches and keeps running, DMG integrity | per release |

## How the tests observe the app
They test from the outside, the way a person would see the app:
- **Window state** comes from the main process: visible, focused, click-through, always on top, size.
- **What's on screen** is read from the canvases: ink colour, thickness, transparency, and whether the highlight, spotlight and zoom lens are drawn.
- **Settings** are read from the app's saved data. The **menu bar menu** is read as the app built it.
- **Global shortcuts and menu clicks** reach the page the same way macOS delivers them. A synthetic key press can't reach a system-wide hotkey, so the tests also check registration with the system.

Stand-ins:
- **Stylus pressure:** real pointer events with `pointerType: "pen"` and a fixed pressure.
- **GitHub Releases:** a local server with real files and checksums, so updates are tested end to end, including refusing a tampered download.
- **macOS `screencapture`:** on Linux CI, `tests/fixtures/fake-screencapture.sh` logs the area requested and returns a test image. That's how the tests check the zoom lens captures exactly `size / magnification` around the pointer and draws beside it.

## Run them
```bash
cd desktop && npm install
npm test                    # both app suites (macOS)
# Linux: install the screencapture stand-in, then run under a virtual display
sudo mkdir -p /usr/local/share/overmark && sudo cp ../tests/fixtures/zoom-pattern.jpg /usr/local/share/overmark/
sudo cp ../tests/fixtures/fake-screencapture.sh /usr/sbin/screencapture && sudo chmod +x /usr/sbin/screencapture
xvfb-run -a -s "-screen 0 1440x900x24" npm test
python ../tests/smoke_test.py   # web page
```

## Latest results: 33/33 and 87/87
Linux under Xvfb, with the screencapture stand-in. Both suites ran three times in a row with no failures. The flow suite also passes without the stand-in, where it checks that zoom fails safely instead.

### Every feature (87)
| # | Feature | Result |
|---|---|---|
| | **Settings · General** | |
| 1 | Tips on: the overlay greets you with the shortcut list | ✅ Overmark is on. ⌘⇧1 draw ⌘⇧2 highlight ⌘⇧7 spotlight ⌘⇧8 zoo… |
| 2 | Tips off: no welcome tip | ✅  |
| 3 | Toolbar position: Bottom puts the drawing toolbar at the bottom | ✅ bottom at y=781, top at y=14 |
| 4 | Show toolbar off: annotating starts with the toolbar hidden | ✅  |
| 5 | Diagnostics shows live state, and Copy puts it on the clipboard | ✅ 782 chars copied |
| | **Settings · Annotate** | |
| 6 | Palette: editing colour 1 changes the toolbar swatch and the ink | ✅ swatch and ink green |
| 7 | Gradient ink blends from the first colour to the second | ✅ start rgb(3,0,251) → end rgb(252,0,3) |
| 8 | Line weight scales every stroke width | ✅ 0.5× → 4 px, 2× → 13 px |
| 9 | Auto-erase: each mark fades out after the set time | ✅ gone after 1.7 s (set to 1 s + fade) |
| 10 | Whiteboard style: white | ✅ rgb(251,251,248) |
| 11 | Whiteboard style: dark | ✅ rgb(22,23,26) |
| 12 | Whiteboard style: white with dots | ✅ 408 dot pixels in a strip |
| | **Settings · Cursor highlight** | |
| 13 | Preview follows the pointer | ✅  |
| 14 | Shape: circle, ring, squircle and rhombus each look different | ✅ 4 distinct |
| 15 | Size changes the highlight area | ✅ 1497 → 24271 px |
| 16 | Colour and opacity | ✅ alpha 51 → 230 |
| 17 | Border style: solid, dashed, dotted and none each look different | ✅ 4 distinct |
| 18 | Border width | ✅ 2591 → 3388 px |
| 19 | Glow | ✅ 2801 → 4630 px |
| 20 | Animation: pulse and breathe move; none stays still | ✅  |
| 21 | Hide when inactive: fades after the set time; off keeps it | ✅ 4630 → 176 px after 1.2 s |
| 22 | The overlay highlight uses these settings | ✅ rgb(0,255,0) at the pointer |
| | **Settings · Spotlight & zoom** | |
| 23 | Spotlight shape: circle, rounded rectangle and squircle each look different | ✅ 3 distinct |
| 24 | Spotlight size: a bigger opening dims less | ✅ 154312 → 102786 dimmed px |
| 25 | Dim strength sets how dark the rest gets | ✅ corner alpha 77 (30%) → 204 (80%) |
| 26 | Soft edge widens the fade around the opening | ✅ 529 → 21568 soft px |
| 27 | Spotlight in the overlay dims to the set strength | ✅ corner alpha 128 at 50% |
| 28 | Zoom captures exactly the area for the magnification and lens size | ✅ -R …,100,100; lens 38524 px |
| 29 | Zoom lens sits beside the pointer, never on it | ✅  |
| 30 | Zoom magnification, lens size, shape and border change the lens | ✅ level, size, shape, border all change the lens |
| | **Shortcuts editor** | |
| 31 | Change a shortcut: ⌘⇧K is saved, registered, and the old one released | ✅ starts drawing |
| 32 | Rejects a single modifier | ✅  |
| 33 | Rejects ⌘⇧3, ⌘⇧4 and ⌘⇧5 (macOS screenshots) | ✅  |
| 34 | Rejects Control + Option (VoiceOver) | ✅  |
| 35 | Rejects a shortcut another action already uses | ✅  |
| 36 | Esc cancels recording and changes nothing | ✅  |
| 37 | Whiteboard (no default) can be given a shortcut, and it works | ✅  |
| 38 | Auto-erase can be given a shortcut, and it works | ✅  |
| 39 | × removes a shortcut | ✅  |
| 40 | Reset all to defaults | ✅  |
| 41 | Menu bar labels show the current shortcuts | ✅ Annotate screen ⌘⇧1 |
| | **About & reset** | |
| 42 | About shows the app version and a working GitHub link | ✅ Version 1.0.0-beta.1 |
| 43 | Reset all settings restores every default | ✅  |
| | **Drawing tools and toolbar** | |
| 44 | Every tool button selects its tool | ✅ 8 tools |
| 45 | Colour keys 1–6 draw in the palette colours | ✅ 6 colours match |
| 46 | Thin, medium and thick buttons, and the − = keys, change thickness | ✅ 4 < 7 < 12 px |
| 47 | Pen ink is solid; highlighter ink is see-through | ✅ alpha 255 vs 97 |
| 48 | Shift snaps a line to 45° | ✅ 38° → 45°, 9° → 0° |
| 49 | Shift makes a perfect square and a perfect circle | ✅  |
| 50 | Arrow tool draws a line with a head | ✅ head makes it 22 px tall vs 7 px |
| 51 | Text: Enter places it, Esc cancels it | ✅  |
| 52 | Undo, redo and clear buttons, enabled only when they can act | ✅  |
| 53 | Undo brings back ink removed by Clear | ✅ both strokes restored with ⌘Z |
| 54 | Backspace clears; F toggles auto-erase (fading ink) | ✅  |
| 55 | Toolbar buttons: highlight, spotlight, whiteboard, key sheet, Done | ✅  |
| 56 | H, S and B keys toggle highlight, spotlight and whiteboard | ✅  |
| 57 | The toolbar can be dragged somewhere else | ✅ moved by 288, 379 |
| 58 | The whiteboard keeps its own ink, separate from the screen | ✅  |
| | **Eraser** | |
| 59 | E selects the eraser; it removes only the part it passes over | ✅ 36 px gap, rest of the line kept |
| 60 | Eraser sizes: small, medium and large cut 16, 36 and 80 px | ✅ 16 px, 36 px, 80 px |
| 61 | − and = change the eraser size | ✅  |
| 62 | A ring at the pointer shows the eraser size (not over the toolbar) | ✅ 84 px ring for the 80 px eraser |
| 63 | Erasing can be undone and redone | ✅  |
| 64 | The eraser works on highlighter ink and text too | ✅ 19932 → 16172 px |
| 65 | The eraser never cuts through the whiteboard | ✅ board intact under the erased gap |
| 66 | With auto-erase on, erased ink never comes back while the rest fades | ✅  |
| | **Sizes, colours and pressure** | |
| 67 | Each tool remembers its own size | ✅ pen thick (12 px), highlighter thin, eraser medium |
| 68 | The 8th swatch opens 24 quick colours; picking one draws in it | ✅ teal from the picker |
| 69 | Esc and clicking elsewhere close the picker; key 8 picks the custom colour | ✅  |
| 70 | Settings → Annotate → Custom colour changes the swatch and the ink | ✅  |
| 71 | Stylus pressure: a harder press draws a thicker line (mouse strokes unaffected) | ✅ light 4 px, hard 11 px, mouse 7 px |
| | **Screenshot** | |
| 72 | The toolbar button saves the screen with ink to the Desktop, hiding the toolbar while it captures | ✅ Overmark 2026-11-27 at 18.03.00.png; "Screenshot saved to Desktop/Overmark 2026-11-27 at 18.03.00.png and copied to the clipboard." |
| 73 | It is copied to the clipboard | ✅  |
| 74 | C key and the menu bar item take screenshots too; quick repeats never overwrite each other | ✅  |
| 75 | Screenshot can have its own global shortcut | ✅  |
| 76 | The menu item is unavailable in the Settings window | ✅  |
| | **Menu bar menu** | |
| 77 | Annotate screen ↔ Stop annotating follows the state; Interactive mode only while drawing | ✅  |
| 78 | Clear ink is enabled only when there is ink, and clears it | ✅  |
| 79 | Annotate without controls | ✅  |
| 80 | Whiteboard, Highlight, Spotlight and Auto-erase are ticked when on | ✅ 4 toggles |
| 81 | Zoom is ticked when on and draws the lens | ✅  |
| 82 | Show shortcuts lists the keys on screen | ✅ ⌘⇧1 draw ⌘⇧2 highlight ⌘⇧7 spotlight ⌘⇧8 zoom ⌘⇧0  |
| 83 | Open at login | ✅ skipped: login items are a macOS feature |
| | **Updates, as people see them** | |
| 84 | A new release shows in Settings with an Install button | ✅ Install update (9.9.0) |
| 85 | …and once on screen during a presentation | ✅ Overmark 9.9.0 is available. Click the menu bar icon → Install update. |
| 86 | …and in the menu bar menu | ✅  |
| | **Settings survive a restart** | |
| 87 | Settings, shortcuts, tool and colour are kept after quitting | ✅ palette, highlight shape, ⌘⇧L, arrow tool, colour 3 |

### User flow (33)
| # | Step | Result |
|---|---|---|
| 1 | First launch opens the Settings window (not an invisible menu bar app) | ✅ 940×760 |
| 2 | Works offline: no internet requests, bundled font loaded | ✅ weights 400/500/600/700/800 |
| 3 | Settings: every tab renders; About credits thepiyushway; no Claude-only sections | ✅ general, annotate, cursor, spot, keys, about |
| 4 | Settings → About → "Check for updates" reports a new version | ✅ shown |
| 5 | Menu bar item is created with every action | ✅ 17 items |
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
| 19 | Zoom (⌘⇧8): lens on a Mac; elsewhere it switches itself off cleanly | ✅ 53660 px lens (stand-in capture) |
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

## Bugs these tests caught before release
| Bug | Fix |
|---|---|
| A fresh download opened silently into the menu bar, with no window and no Dock icon, so it looked broken | First launch opens Settings |
| Opening the app again while it was running did nothing | Opening it again shows Settings |
| A menu bar click was lost if the menu changed while open | Callbacks from recent menus are kept |
| The menu's "Clear ink" stayed enabled after clearing | The menu refreshes whenever ink changes |
| **Clear couldn't be undone**: ⌘Z did nothing, and only ⇧⌘Z brought the ink back | Undo restores cleared ink |
| About's GitHub link pointed nowhere, because the template used an undefined variable | Fixed, and links open in the browser |
| About showed the page's internal version (4.8), not the app's (1.0.0-beta.1) | Shows the app version |
| Diagnostics → Copy relied on the browser clipboard, which is unreliable in a desktop app | Copies through the app |
| The shortcut editor accepted Control + Option combinations, which macOS rejects because VoiceOver uses them | Refused with an explanation |
| The update notice was checked before the overlay started, so it never appeared on screen | Shown after the welcome tip |
| The font came from the internet, so offline it fell back to a system font | Bundled |
| Zoom retried for about 1.6 s when it couldn't capture, and its message said "Allow Claude" | Stops on the first such failure and names Overmark |
| The page could ask the app to run any command or read any file | Only the zoom capture and the temp folder are allowed |
| Two screenshots taken in the same second overwrote each other | The second is saved as "… (2).png" |
| The eraser's size ring was drawn over the toolbar | It only appears where the eraser can erase |

## What still needs a real Mac
CI can't cover four things:
- **Real system-wide hotkey presses.** CI checks registration and delivery, but not a physical key press.
- **The real zoom capture with the Screen Recording permission.**
- **Login items.**
- **Swapping in an update.** CI verifies the download, its checksum, the app ID and the signature, but not the swap itself.

The release workflow's macOS job builds and launches the packaged app. A one-off manual check on a Mac covers the rest.
