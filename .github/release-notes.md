**Overmark: draw on anything on your screen.** Annotate, highlight and spotlight your cursor, and zoom, over any app on your Mac. Free and open source. Built with Claude by [@thepiyushway](https://github.com/thepiyushway).

## Download
| Your Mac | File |
|---|---|
| Apple Silicon (M1 and later) | `Overmark-<version>-arm64.dmg` |
| Intel | `Overmark-<version>-x64.dmg` |

Not sure which you have? Apple menu → About This Mac: "Chip: Apple M…" means Apple Silicon.

## Install
<install>

Full guide: [docs/SETUP.md](https://github.com/thepiyushway/overmark/blob/main/docs/SETUP.md)

## Updates
Overmark checks GitHub twice a day. When a new version is out you see it in a notification, in Settings and on screen, and the menu bar icon shows **Install update**: it downloads the new version, checks it against `SHA256SUMS.txt`, replaces the app and reopens it. Check any time from the menu bar icon → **Check for updates…**, or Settings → About.

## Shortcuts
⌘⇧1 annotate · ⌘⇧9 annotate without toolbar · ⌘⇧2 highlight cursor · ⌘⇧7 spotlight · ⌘⇧8 zoom · ⌘⇧0 clear · / while drawing shows every key.

## How this build was checked
These checks run automatically before the release is published:
- The web-app smoke test (`tests/smoke_test.py`) passes.
- The end-to-end tests of the standalone app pass: a 33-step user flow and a 69-step test of every feature, setting, tool, shortcut rule, menu item and update notice. See [docs/TESTING.md](https://github.com/thepiyushway/overmark/blob/main/docs/TESTING.md).
- Both apps have a valid code signature (Developer ID and notarized by Apple, when configured) and run from the menu bar only.
- The Apple Silicon app launches and stays running.
- The DMG images pass `hdiutil verify`.

`SHA256SUMS.txt` lists the checksum of every file.
