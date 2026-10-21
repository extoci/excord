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

Native builds on main and pull requests use ad-hoc Mac signatures. Release builds reuse one persistent self-signed code-signing certificate. This supports Squirrel's signing identity check without an Apple Developer membership. It is not Developer ID signing or notarization, so macOS still requires the user to approve the initial installation. Windows remains unsigned. No upstream signing identity or certificate belongs in Excord's build.

### One-time certificate setup

Run `node --import tsx scripts/create-mac-update-certificate.mts /absolute/private/path/excord-signing` once, outside the repository. The destination must not already exist. The script creates a self-signed RSA code-signing identity valid for ten years, an encrypted PKCS#12 export, and a random export password. It works with OpenSSL on Linux or macOS, prints no secrets, and makes no GitHub changes. Keep a secure backup of this directory. Never generate a new release identity on each CI run.

After the repository owner approves GitHub changes, configure these private Actions secrets:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64-encoded contents of `identity.p12` |
| `CSC_KEY_PASSWORD` | Contents of `password.txt` |

No Apple account credentials are needed. On a Mac, the same self-signed code-signing identity can also be created with Keychain Access's Certificate Assistant and exported as an encrypted `.p12`. Use the certificate name `Excord Updates`.

Release checks the two inputs before building. The Mac release packaging step trusts the public certificate on its disposable runner, then electron-builder imports the private key into a temporary signing keychain. `scripts/build/mac-release.cjs` selects that identity instead of the development ad-hoc signature. Missing credentials or an unavailable signing identity fail the release. Pull requests use no release secrets. `scripts/trust-mac-update-certificate.mts` is restricted to disposable Mac CI runners; people installing Excord do not need to import or trust the signing certificate in Keychain Access.

The native Mac workflow runs `scripts/mac-update-signing-smoke.mts` with a throwaway fixture certificate. It signs two different app versions ad-hoc and requires the cross-version check to fail. It then signs both with the same self-signed certificate and requires the check to pass. An app from a different signing identity must still fail. This tests the code requirement that caused the alpha3-to-alpha4 failure, rather than reinstalling an identical artifact.

`scripts/check-mac-update-signing.mts` runs before release publication. It verifies bundle integrity, the certificate fingerprint against the configured identity, and a designated requirement independent of the current build's code hash. It extracts the actual updater ZIP and verifies its app against the packaged app's requirement. With a previous certificate-signed release available on a Mac, run `EXCORD_MAC_SIGNING_CERTIFICATE=/path/to/certificate.pem node --import tsx scripts/check-mac-update-signing.mts /path/to/previous/Excord.app` to check the new ZIP against that previous app instead. It must fail for an incompatible signing identity.

### Migrating from the ad-hoc alphas

The alpha3-to-alpha4 install failure is `SQRLCodeSignatureErrorDomain`, code `-1`, with "code failed to satisfy specified code requirement(s)". Squirrel.Mac checks the new bundle against the installed app's designated code requirement. An ad-hoc requirement uses the build's code hash, which changes between releases. `codesign --verify --deep --strict` can pass for each app independently while the update still fails. Reinstalling the same build in CI did not test this cross-version requirement.

Existing ad-hoc installations need one manual migration, even after a certificate-signed release is published. Quit Excord, download the new DMG from Releases, and replace Excord in `/Applications`. Keep the existing profile to preserve settings and login. Subsequent releases must reuse the same certificate and app identifier. Replacing or losing that certificate requires another manual migration. Notarization alone would not repair the old installed app's requirement. Do not weaken or bypass Squirrel's signature check.

Settings recognizes native signature rejections and directs the user to this manual installation. It disarms installation on quit and stops offering retries of the rejected package. This recovery UI does not change copies of alpha3 or alpha4 that are already installed.

The startup and plugin smoke tests run without an account. They do not verify account login, voice calls, camera permissions, screen sharing with audio, tray behavior, or notifications on physical machines. Complete those checks and a real-device update on the user's Mac and Windows computer before calling a release ready for daily use.

## Closed alpha

The original closed alpha releases used an ad-hoc Mac signature with certificate discovery disabled. Future Release workflow builds require the persistent self-signed certificate described above; standalone Native builds remain ad-hoc. The updater uses one release track. It never gates launch, opens a popup, downloads automatically, or installs without explicit consent. It checks one minute after Discord loads and once per day afterward; Check for updates bypasses that interval. Installation on quit is opt-in for the current running session and does not reopen the app. An explicit Restart and update does reopen it. A complete signed-version update, restart, and install-on-quit still need verification on real devices. No repository token belongs in the application.

The workflow also runs installer checks on disposable native hosts. It installs, launches, relaunches, reinstalls the same artifact, and verifies synthetic-cookie persistence and normal shutdown. This is a reinstallation check, not proof of migration between every historical version. `scripts/install-smoke.mts` requires CI because installation writes OS registrations. Recovery integration checks use a profile path with spaces, malformed settings, a native plugin, safe mode, an offline request failure, and a diagnostics export.

Kits are discontinued. Release assets are the Mac DMG and updater ZIP, Windows Setup and ZIP, blockmaps, latest-channel metadata, matching source, and SHA256SUMS.

## Single update track

The first version is `0.0.0-alpha1`, tagged `v0.0.0-alpha1`. The updater selects the newest published GitHub release carrying both Windows and Mac latest-channel metadata. Drafts and incomplete releases are ignored.

The app resolves that release's immutable GitHub download directory and uses electron-updater's generic provider with `latest.yml` or `latest-mac.yml`. Packaging explicitly writes the latest channel even for prerelease version strings. Version comparison and package integrity remain electron-updater's responsibility; downgrades are disabled. Alphas use versions such as `0.0.0-alpha2` and `0.0.0-alpha3`, tagged `v0.0.0-alpha2` and `v0.0.0-alpha3`. Future versions must increase according to SemVer. Check ordering before each release, since prerelease identifiers such as `alpha10` and `alpha2` sort lexically.

The release workflow adds the source archive and checksums only after native verification succeeds. Tag-triggered releases are published; manual workflow runs create drafts, which the updater ignores. Source and runtime updates ship together. Settings display errors and allow retries without affecting Discord. Installation state and consent are not persisted across crashes or launches.
