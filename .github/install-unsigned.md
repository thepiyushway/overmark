1. Open the DMG and drag **Overmark** into **Applications**.
2. Open Overmark from Applications. macOS blocks it the first time because this build isn't notarized by Apple: click **Done**, then go to System Settings → Privacy & Security, scroll down and click **Open Anyway**.
   - If macOS says the app "is damaged", run this once in Terminal and open it again:
     `xattr -dr com.apple.quarantine /Applications/Overmark.app`
3. Overmark lives in the **menu bar** (no Dock icon). Press **⌘⇧1** to draw, **Esc** to finish.
4. For the zoom lens, allow Overmark in System Settings → Privacy & Security → **Screen Recording**, then reopen it.
