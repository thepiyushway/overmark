# Signing and notarizing Overmark (no security warnings)

macOS lets a downloaded app open normally only if it is **signed with a Developer ID** and **notarized by Apple**. Notarization means Apple has scanned it for malware. Without both, macOS blocks the first open and people have to click **Open Anyway** in System Settings.

With both, Overmark installs like any app from the web: open the DMG, drag it to Applications, double-click. macOS shows only its usual one-time "Overmark is an app downloaded from the internet. Open?" question, the same one Chrome and Slack get.

The release workflow is already set up. Once the five GitHub secrets below exist, every release is signed and notarized automatically, and checked the way Gatekeeper checks it before it's published.

## 1. Join the Apple Developer Program (US$99 a year)
- In India, enroll with the **Apple Developer** app on an iPhone, iPad or Mac (Apple only allows that route there). Choose **Individual**.
- Your Apple Account needs two-factor authentication.
- As an individual, your legal name appears as the developer.
- Note your **Team ID**: developer.apple.com → Account → **Membership details**. It's 10 characters, like `AB12CD34EF`.

## 2. Create a "Developer ID Application" certificate
On your Mac, the easiest way is through Xcode (free on the Mac App Store):
1. Xcode → Settings → **Accounts** → add your Apple Account → select your team → **Manage Certificates…**
2. Click **+** → **Developer ID Application**.

Or on the web: developer.apple.com → Certificates → **+** → *Developer ID Application*. Upload a certificate request made in Keychain Access (Certificate Assistant → Request a Certificate From a Certificate Authority), download the result and double-click it.

Then export it with its private key:
1. Open **Keychain Access** → login → **My Certificates**.
2. Right-click **Developer ID Application: Your Name (TEAMID)** → **Export…** → save as `overmark-cert.p12` with a strong password.
3. Turn it into text for GitHub:
   ```bash
   base64 -i overmark-cert.p12 | pbcopy     # now on your clipboard
   ```

## 3. Create an app-specific password
account.apple.com → **Sign-In and Security** → **App-Specific Passwords** → **+**, then name it "Overmark notarization". Apple uses it only for notarization; it isn't your account password.

## 4. Add the five secrets on GitHub
github.com/thepiyushway/overmark → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|---|---|
| `MAC_CERT_P12_BASE64` | the base64 text from step 2 |
| `MAC_CERT_PASSWORD` | the password you gave the `.p12` |
| `APPLE_ID` | your Apple Account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the password from step 3 |
| `APPLE_TEAM_ID` | your Team ID from step 1 |

GitHub encrypts secrets. They aren't visible to anyone, aren't shown in logs, and aren't available to pull requests from forks.

## 5. Release
Bump `"version"` in `desktop/package.json` (e.g. `1.0.0`), add a `## 1.0.0` section to `CHANGELOG.md`, and merge `main` into `release` (see [RELEASING.md](RELEASING.md)). The workflow then:
1. runs every test;
2. builds the Apple Silicon and Intel apps, signs them with your Developer ID using the hardened runtime, and sends them to Apple for notarization (usually a few minutes);
3. staples Apple's ticket to each app, so it opens even offline;
4. runs Gatekeeper's own check (`spctl`): it must say **"source=Notarized Developer ID"**, or nothing is published;
5. publishes the release. The release notes switch to the simple install steps automatically.

People on the old beta get the update in the app as usual. From then on, the updater only accepts updates signed by **your** Developer ID team. A download signed by anyone else is refused, even if it was uploaded to this repo.

## What's in the signature
`desktop/build/entitlements.mac.plist` asks only for what Electron's JavaScript engine needs to run under the hardened runtime. It requests no access to the camera, microphone, contacts or files. The zoom lens still needs Screen Recording, which each person grants in System Settings.

## Optional, later
- **Homebrew:** `brew install --cask overmark` needs a cask file pointing at the release DMG. Signed apps are much easier to get accepted.
- **Mac App Store:** a separate, sandboxed edition, where zoom would need rewriting with ScreenCaptureKit and updates come only from the App Store. See the discussion in the project notes.
