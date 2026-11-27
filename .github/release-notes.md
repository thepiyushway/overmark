**Overmark: draw on anything on your screen.** Annotate, highlight and spotlight your cursor, and zoom, over any app on your Mac. Free and open source. Built with Claude by [@thepiyushway](https://github.com/thepiyushway).

## Download
| Your Mac | File |
|---|---|
| Apple Silicon (M1 and later) | `Overmark-<version>-arm64.dmg` |
| Intel | `Overmark-<version>-x64.dmg` |

Not sure which you have? Apple menu → About This Mac: "Chip: Apple M…" means Apple Silicon.

## Install
1. Open the DMG and drag **Overmark** into **Applications**.
2. Open Overmark from Applications. macOS blocks it the first time because this free build isn't notarized by Apple: click **Done**, then go to System Settings → Privacy & Security, scroll down and click **Open Anyway**.
   - If macOS says the app "is damaged", run this once in Terminal and open it again:
     `xattr -dr com.apple.quarantine /Applications/Overmark.app`
3. Overmark lives in the **menu bar** (no Dock icon). Press **⌘⇧1** to draw, **Esc** to finish.
4. For the zoom lens, allow Overmark in System Settings → Privacy & Security → **Screen Recording**, then reopen it.

Full guide: [docs/SETUP.md](https://github.com/thepiyushway/overmark/blob/main/docs/SETUP.md)

## Updates
Overmark checks GitHub twice a day. When a new version is out you get a notification, and the menu bar icon shows **Install update**: it downloads the new version, checks it against `SHA256SUMS.txt`, replaces the app and reopens it. Check any time from the menu bar icon → **Check for updates…**, or Settings → About.

## Shortcuts
⌘⇧1 annotate · ⌘⇧9 annotate without toolbar · ⌘⇧2 highlight cursor · ⌘⇧7 spotlight · ⌘⇧8 zoom · ⌘⇧0 clear · / while drawing shows every key.

## How this build was checked
These checks run automatically before the release is published:
- The web-app smoke test (`tests/smoke_test.py`) passes.
- The 33-step end-to-end test of the standalone app (`tests/standalone_e2e.js`) passes: first launch, settings, every drawing tool, undo and redo, whiteboard, highlight, spotlight, zoom handling, clearing, reload, reopen, close-keeps-running, quit, relaunch, the updater (including refusing a tampered download), working offline, and the security limits.
- Both apps have a valid ad-hoc signature and are set to run from the menu bar only.
- The Apple Silicon app launches and stays running.
- The DMG images pass `hdiutil verify`.

`SHA256SUMS.txt` lists the checksum of every file.
