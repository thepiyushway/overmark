# Testing

## Automated: `tests/smoke_test.py`
Headless Chromium runs `index.html` against a mock of the desktop API (`window.claude.use("desktop")`). It covers:

| Area | What's checked |
|---|---|
| Landing page (light, dark, 390 px) | Renders without errors; the Install button appears; pen, line with Shift snapping, gradient ink, highlight, spotlight, whiteboard and the `/` key sheet work on the demo window |
| Settings window | All six tabs render; shapes and animation change; the shortcut recorder saves ⌘⇧B; zoom permission runs a test `screencapture` |
| Overlay | Six global shortcuts register; ⌘⇧1 starts drawing; a stroke is saved; Esc hands the keyboard back; the zoom loop runs `screencapture` and reads the image; spotlight works; diagnostics record every step |

```bash
pip install playwright pillow && playwright install chromium
python tests/smoke_test.py      # prints ALL SMOKE TESTS PASSED
```

## On a real Mac
Results of the manual test run on a real Mac are recorded in the release notes for each version.
