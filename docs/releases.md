# Excord releases

Excord uses GitHub Actions, GitHub Releases, and electron-updater. The desktop app and its pinned Equicord catalog ship together. There is no Excord-hosted catalog or update server.

The repository is currently private. Keep it private until the user asks to publish it. GitHub requires repository access to download its artifacts and releases. A private repository's update feed is not available to unauthenticated desktop installations. Do not embed a GitHub token in the application.

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

Closed alpha builds use an ad-hoc Mac signature with certificate discovery disabled and verifies its bundle integrity using `codesign --verify --deep --strict`. This is not a Developer ID signature or notarization. Windows remains unsigned. The alpha uses manual updates. It does not check the private feed on startup, and its update action explains how to obtain the next shared installer. No repository token belongs in a tester's app.

The workflow also runs installer checks on disposable native hosts. It installs, launches, relaunches, reinstalls the same artifact, and verifies synthetic-cookie persistence and normal shutdown. This is a reinstallation check, not proof of migration between every historical version. `scripts/install-smoke.mts` requires CI because installation writes OS registrations. Recovery integration checks use a profile path with spaces, malformed settings, a native plugin, safe mode, an offline request failure, and a diagnostics export.

For each verified alpha source revision, prepare a Mac and Windows alpha kit. Include its unchanged installer, `closed-alpha.md`, `alpha-checklist.md`, `alpha-feedback.md`, matching source archive, and `SHA256SUMS`. The maintainer can download these from the private draft and forward the kits without granting repository access. The repository remains private. Do not invite testers, send messages, or change repository visibility as part of packaging.
