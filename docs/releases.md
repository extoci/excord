# Excord releases

Excord uses GitHub Actions, GitHub Releases, and electron-updater. The desktop app and its pinned Equicord catalog ship together. There is no Excord-hosted catalog or update server.

Distribution is intended to use public GitHub Releases. Until the owner makes the repository public, unauthenticated update checks cannot access it and fail quietly in Settings. Do not change repository visibility as part of packaging or embed a GitHub token in the app.

## Native build artifacts

The Native builds workflow runs on pushes to main and on pull requests. It checks strict TypeScript with ts-rust and the reference compiler, runs the folder-compiler tests, builds the app, tests RPC, and exercises local plugins in Electron against Discord's login page.

Each job then builds its installer and archive, checks the package contents, and repeats the Electron plugin test from the packaged ASAR. These checks catch failures that a development launch misses, including a missing compiler executable or an ASAR path that cannot execute a subprocess.

Separate shutdown tests launch the actual packaged executable and the ASAR without an inspector. They refresh five times, request normal `app.quit()`, require the full quit lifecycle, and fail if a process kill is necessary. Under Playwright on Windows, Electron can remain alive after its quit event even after detaching the Node inspector or calling `process.exit`. The browser test permits process-tree cleanup only after a file records the quit event. A missing quit marker still fails the test. This workaround exists only in the browser test, and does not replace the independent normal-shutdown checks.

The primary artifacts are an Apple silicon DMG and ZIP, plus a Windows x64 installer and ZIP. The macOS package declares macOS 27 as its minimum system version. CI currently uses GitHub's macOS 26 Apple silicon runner to build and smoke-test the Electron runtime; testing physical device behavior on macOS 27 remains separate.

CI artifacts stay private with the repository. Verification artifacts include the smoke-test report and a screenshot of the logged-out app. They contain no Discord credentials.

Release packages exclude generated source maps and the renderer's build report. The matching JavaScript, CSS, and maps remain in a separate `debug-symbols-*` CI artifact for 14 days. Development builds still link their source maps. Local plugins keep their own inline maps so plugin authors retain useful error locations.

Mac artifacts use maximum compression. Windows uses normal compression because maximum ZIP compression pushed its packaging step past 16 minutes on the native runner. Compression changes packaging time and download size, not the code Electron executes. Chromium ships only its `en-US` language resources. Discord's website can still use other interface languages, but Chromium menus and messages fall back to English. This does not remove spell-check dictionaries, which Electron manages separately.

`bun run check:package` rejects accidentally bundled maps and reports ASAR bytes, compiler bytes, total installed regular-file bytes, the largest files, locale files, and installer/archive sizes in `test-results/package.json`. Installed bytes exclude symlinks and filesystem allocation overhead. Keep graphics fallbacks, plugin definitions, the local compiler, and license notices in the release.

## Draft and tagged releases

To prepare a private draft, run the Release workflow manually from GitHub Actions. It builds and verifies both native targets, then creates a draft release for the version in package.json.

For a published release, update package.json and the lockfile, commit the version change, then push the matching `vX.Y.Z` tag. The release workflow builds the tagged source, uploads the installers and updater metadata, and generates release notes. A tag containing a suffix creates a prerelease.

Version tags and package.json must match. Do not move an existing release tag to different source code. Record the bundled Equicord revision in the release notes whenever it changes.

## Signing and live feature checks

The initial builds are unsigned and unnotarized. They are development builds for manual testing. Public distribution needs the project's own Apple and Windows signing configuration. No upstream signing identity or certificate belongs in Excord's build.

The smoke tests verify startup and plugin loading without an account. They do not verify signing, account login, voice calls, camera permissions, screen sharing with audio, tray behavior, or notifications on physical machines. Complete those checks on the user's Mac and Windows computer before calling a release ready for daily use.

## Closed alpha

Closed alpha builds use an ad-hoc Mac signature with certificate discovery disabled and verifies its bundle integrity using `codesign --verify --deep --strict`. This is not a Developer ID signature or notarization. Windows remains unsigned. The updater uses one release track. It never gates launch, opens a popup, downloads automatically, or installs without explicit consent. It checks one minute after Discord loads and once per day afterward; Check for updates bypasses that interval. Installation on quit is opt-in for the current running session and does not reopen the app. An explicit Restart and update does reopen it. Mac update installation still needs verification with the project's eventual distribution signature on real devices. No repository token belongs in the application.

The workflow also runs installer checks on disposable native hosts. It installs, launches, relaunches, reinstalls the same artifact, and verifies synthetic-cookie persistence and normal shutdown. This is a reinstallation check, not proof of migration between every historical version. `scripts/install-smoke.mts` requires CI because installation writes OS registrations. Recovery integration checks use a profile path with spaces, malformed settings, a native plugin, safe mode, an offline request failure, and a diagnostics export.

Kits are discontinued. Release assets are the Mac DMG and updater ZIP, Windows Setup and ZIP, blockmaps, latest-channel metadata, matching source, and SHA256SUMS.

## Single update track

The first version is `0.0.0-alpha1`, tagged `v0.0.0-alpha1`. The updater selects the newest published GitHub release carrying both Windows and Mac latest-channel metadata. Drafts and incomplete releases are ignored.

The app resolves that release's immutable GitHub download directory and uses electron-updater's generic provider with `latest.yml` or `latest-mac.yml`. Packaging explicitly writes the latest channel even for prerelease version strings. Version comparison and package integrity remain electron-updater's responsibility; downgrades are disabled. Future versions must increase according to SemVer. Use numeric prerelease components for subsequent builds, such as `0.0.1-alpha.1`, to avoid lexical ordering of `alpha10` and `alpha2`.

The release workflow adds the source archive and checksums only after native verification succeeds. Tag-triggered releases are published; manual workflow runs create drafts, which the updater ignores. Source and runtime updates ship together. Settings display errors and allow retries without affecting Discord. Installation state and consent are not persisted across crashes or launches.
