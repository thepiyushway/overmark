# Releasing a new version

1. Make your changes and run the tests (see [TESTING.md](TESTING.md)).
2. Bump `"version"` in `desktop/package.json`, for example `1.0.0` → `1.0.1`. A suffix such as `-beta.2` marks a pre-release. Commit and push to `main`.
3. On GitHub, open **Actions → Test, build and release → Run workflow**. Enter the tag `v` + the version (e.g. `v1.0.1`) and click **Run workflow**. Pushing a `v*` tag does the same.
4. The workflow then:
   - runs both test suites;
   - builds the Apple Silicon and Intel DMGs and zips on a Mac;
   - checks the signatures and that the app launches;
   - publishes the release with `SHA256SUMS.txt`.

   It refuses to release if the tag and the version don't match.
5. Within 12 hours, everyone running Overmark gets a notification, and **Install update** appears in their menu bar menu.

Updates follow the release type. People on a stable version are offered only stable releases; people on a beta are also offered newer betas.

Release notes come from `.github/release-notes.md`. Edit it before step 3 to describe what changed.
