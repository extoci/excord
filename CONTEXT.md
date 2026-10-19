# Excord project context

Excord wraps Discord's website with Electron. It targets Apple silicon macOS 27+ and Windows x64 first. Linux remains supported by the inherited desktop code, but is a lower product priority.

The project derives its desktop integration from Equibop and Vesktop. Its pinned Equicord runtime lives in `vendor/equicord`. Preserve upstream copyright notices and record version changes in `upstream.lock.json` and `docs/compatibility.md`.

## Build and verification

Use Bun 1.4 and Node 22 or later. `bun install --frozen-lockfile` installs the pinned dependencies. `bun run build` builds Equicord, then the desktop bundles. `bun run start` builds and launches Electron. `bun run check` runs the ts-rust checker and compiler tests. `bun run typecheck:reference` cross-checks with TypeScript.

After a build, `bun run test:rpc` checks the Node RPC worker. `bun run test:electron` loads the real Discord login page, tests renderer and native module sharing, and exercises refresh, cache hits, syntax-error isolation, and recovery. It uses an isolated temporary profile and requires a display on Linux. `bun run test:electron --packaged` checks the packaged ASAR produced by electron-builder. GitHub Actions builds and verifies on native Apple silicon and Windows runners.

`node --import tsx scripts/quit-smoke.mts --packaged --refresh` checks normal executable shutdown after five refreshes without an inspector. `--archive --refresh` checks the ASAR the same way. These checks fail on forced shutdown. Windows browser automation has a separate, documented teardown workaround after a recorded quit event; keep the independent shutdown checks strict.

When a browser test reuses a profile, wait for the child process's exit event before relaunching. A completed `taskkill` call alone does not establish process exit. Recovery CI repeats the full sequence twice per platform. Discord navigation waits allow 30 seconds; these timeouts are test bounds, not startup performance measurements.

The Excord settings component has a standalone development preview at `bun run scripts/preview-control.mts`. Its banner identifies its sample metrics and fake folder operations. It uses the actual component, but it is not a substitute for the Electron tests.

## Main modules

`scripts/build/runtime.mts` builds the upstream runtime and its shared module registries. Preserve Equicord's original import evaluation order. Register local renderer plugins immediately before upstream `initPluginManager`, not before the initial `~plugins` import graph finishes.

`scripts/build/optimizePatcher.mts` applies a checked transformation to the pinned patcher, backed by semantic comparisons against the original. `src/excord/patchPrefilter.ts` can only reject definite misses; positive candidates retain upstream replacement semantics. Keep the vendor tree unchanged and review this transform when updating the pin.

`src/main/background.ts` and `src/excord/realtime.ts` protect live WebRTC/capture while allowing idle background scheduling. Preserve the native test in `scripts/power-smoke.mts`, including hidden WebRTC echo, visibility transitions, instant settings, and subframe isolation. Electron 43.8 re-enabling while already hidden is deferred until show. Benchmark methodology and limits are in `docs/performance.md`; the performance workflow compares both revisions on each same native host. Clear Playwright's own visibility override before measuring.

`src/excord/compiler.ts` owns folder discovery, content fingerprints, per-plugin builds, shared API resolution, CSS and file imports, and cache cleanup. The compiler loads lazily. In packaged apps its executable must run from `app.asar.unpacked`.

`src/excord/service.ts` owns the privileged desktop API, native helper registration and replacement, serialized refreshes, and on-demand process metrics. `src/excord/runtime.ts` registers renderer definitions before the upstream plugin manager initializes.

`src/main/arrpc` runs the existing Node arRPC server in an Electron worker only when enabled. Do not reintroduce a standalone Bun runtime. RPC and process scanning default to off. `src/excord/efficiency.ts` adds the optional ExcordEfficiency plugin.

The bundled runtime owns QuickCSS and theme watchers. Do not add a second set in the desktop wrapper. The Electron smoke test checks that one QuickCSS edit emits one update after repeated refreshes. Build scripts collect dependency license texts from the actual bundle input graph, and package checks require them in the release.

`--safe-mode` bypasses modification preloads, bundled runtime, personal plugins, themes, and RPC while preserving the same session profile. It uses software rendering and stable window defaults. `src/main/recovery.ts` owns native recovery actions and export; `src/excord/diagnosticReport.ts` explicitly selects report fields. Never export raw errors, plugin source, profile paths, cookies, or account data. Reset backs up known settings and QuickCSS files and preserves personal plugin/theme folders.

Closed alpha builds use manual updates. Mac screen sharing uses Electron's native system picker and declares `NSAudioCaptureUsageDescription`; live-device audio remains a manual check. Native CI also tests DMG/NSIS installation, relaunch and same-build reinstallation with synthetic cookie persistence, safe mode, offline recovery, and diagnostics privacy. `scripts/install-smoke.mts` must run only on disposable CI runners because it changes OS installation registrations. `scripts/prepare-alpha.mts` packages per-platform kits from a verified source SHA and requires passing installer/recovery/plugin reports.

`src/excord/ControlCenter.tsx` presents local plugins, metrics, and compatibility information inside Discord settings. Desktop settings below it retain the inherited hardware, tray, notification, theme, and window controls.

## Release boundaries

The repository is currently private at github.com/extoci/excord. Do not change its visibility without the user's instruction. Native build workflows upload private CI artifacts. Tag releases and the manual draft workflow use GitHub Releases and electron-updater metadata. The project does not host a plugin catalog or an update server. See `docs/releases.md` for release steps and signing limits.

Never describe every plugin or voice/screen-share behavior as verified merely because the catalog builds. Live account behavior and physical device permissions need separate tests. Current retained upstream mechanisms and known costs belong in the compatibility record.
