# Setting up Overmark

## A. Standalone Mac app (DMG)

1. Download `Overmark-<version>-arm64.dmg` (Apple Silicon) or `-x64.dmg` (Intel) from the repo's Releases page.
2. Open the DMG and drag **Overmark** into **Applications**.
3. Open Overmark. Builds without a Developer ID signature are blocked the first time: right-click Overmark → **Open** → **Open**. On macOS 15 and later, go to System Settings → Privacy & Security → **Open Anyway**.
4. Overmark runs from the **menu bar**, so there's no Dock icon. The Settings window opens on first launch.
5. Click **Run in menu bar**, or **Annotate now** to start drawing straight away.
6. **Zoom** (optional): press ⌘⇧8 or go to Settings → Spotlight & Zoom. macOS asks to let Overmark record the screen. Allow it in System Settings → Privacy & Security → **Screen Recording**, then quit and reopen Overmark from its menu bar icon.
7. **Open at login** (optional): menu bar icon → **Open at login**.

Quit from the menu bar icon → **Quit Overmark**. Closing the Settings window keeps it running.

## B. Claude app (inside the Claude desktop app)

1. Open the Overmark artifact link in the **Claude desktop app**. The owner shares it from the artifact's Share menu.
2. Click **Install as Mac app**, then open **Overmark** from the Dock or Applications.
3. Click **Get started** and **Allow** each Claude prompt: draw over other apps, keyboard shortcuts and the menu bar icon.
4. **Zoom** (optional): Settings → Spotlight & Zoom → **Turn on zoom**. Claude asks for full access, then macOS asks to let **Claude** record the screen.
5. After an update, open the menu bar icon → **Reload Overmark (get updates)**, or click **Reload** on Claude's notice. Each new version asks for its permissions once.

## Using it

| Do this | How |
|---|---|
| Start or stop drawing | ⌘⇧1, or menu bar → Annotate screen |
| Draw with no toolbar | ⌘⇧9 |
| Finish and keep ink | Esc, or the **Done** button |
| Clear ink | ⌘⇧0, or X while drawing |
| Cursor highlight / spotlight / zoom | ⌘⇧2 / ⌘⇧7 / ⌘⇧8 |
| Whiteboard | B while drawing, or menu bar → Whiteboard |
| Every drawing key | / while drawing |
| Change any shortcut | Settings → Shortcuts → Change (two modifier keys plus a letter or number) |

## Troubleshooting

| Symptom | Fix |
|---|---|
| A shortcut does nothing | Another app may use it: Settings → Shortcuts shows a red note. Pick another combination. ⌘⇧3/4/5 are reserved for screenshots. Control+Option combinations are refused because macOS VoiceOver uses them. |
| The zoom lens is black or shows only the wallpaper | Allow Screen Recording for Overmark (standalone) or Claude (Claude app), then reopen the app. |
| Ink appears on the wrong display | Overmark covers the display your pointer is on when you start drawing. Move the pointer there and press ⌘⇧1 again. |
| Claude app shows "This app has a new version" | Click **Reload**, or menu bar → Reload Overmark. |
| You need to report a bug | Settings → General → Diagnostics → **Copy**, and paste it into an issue. |
