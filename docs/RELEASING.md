# Branches and releases

| Branch | What it holds | What happens on push |
|---|---|---|
| `main` | Everyday work: features, fixes, docs | All tests run (`tests.yml`). Nothing is published. |
| `release` | What people are running | Tests run again. If the version is new, the Mac app is built, checked and published as a GitHub Release, and everyone's copy of Overmark offers the update. |

## Shipping an update
1. Work on `main` (or on branches merged into `main`). Keep the tests green.
2. When there's a meaningful change to share:
   - bump `"version"` in `desktop/package.json`, e.g. `1.0.0` → `1.0.1` (fix), `1.1.0` (feature) or `2.0.0` (big change). A suffix such as `-beta.2` makes it a pre-release.
   - add a `## <version>` section at the top of `CHANGELOG.md`. That text becomes the release notes users see under **What's new…**.
3. Merge `main` into `release`. Either open a pull request from `main` to `release` on GitHub (the tests run on the PR), or locally:
   ```bash
   git checkout release && git merge --ff-only main && git push && git checkout main
   ```
4. The **Release** workflow does the rest. A push to `release` without a new version runs the tests and publishes nothing; it says so in the run summary.

## What users see
Within 12 hours of a release (or straight away, if they click **Check for updates…**), everyone running the downloadable app sees:
- a macOS notification: "Version X is available";
- a banner in Settings with an **Install update** button;
- a short notice on screen the next time the overlay starts (once per version);
- **Install update (version X)…** and **What's new…** in the menu bar menu.

Installing downloads the new version and checks it against the release's `SHA256SUMS.txt`, its code signature and its app ID. It then replaces the app and reopens it.

People on a stable version are offered only stable releases. People on a pre-release are also offered newer pre-releases.

The Claude-app edition updates when the artifact is republished from a Claude session.
