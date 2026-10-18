# Excord project context

Excord wraps Discord's website with Electron. It targets Apple silicon macOS 27+ and Windows x64 first. Linux remains supported by the inherited desktop code, but is a lower product priority.

The project derives its desktop integration from Equibop and Vesktop. Its pinned Equicord runtime lives in `vendor/equicord`. Preserve upstream copyright notices and record version changes in `upstream.lock.json` and `docs/compatibility.md`.

## Build and verification

Use Bun 1.4 and Node 22 or later. `bun install --frozen-lockfile` installs the pinned dependencies. `bun run build` builds Equicord, then the desktop bundles. `bun run start` builds and launches Electron. `bun run check` runs the ts-rust checker and compiler tests. `bun run typecheck:reference` cross-checks with TypeScript.

After a build, `bun run test:rpc` checks the Node RPC worker. `bun run test:electron` loads the real Discord login page, tests renderer and native module sharing, and exercises refresh, cache hits, syntax-error isolation, and recovery. It uses an isolated temporary profile and requires a display on Linux. `bun run test:electron --packaged` checks the packaged ASAR produced by electron-builder. GitHub Actions builds and verifies on native Apple silicon and Windows runners.

The Excord settings component has a standalone development preview at `bun run scripts/preview-control.mts`. Its banner identifies its sample metrics and fake folder operations. It uses the actual component, but it is not a substitute for the Electron tests.

## Main modules

`scripts/build/runtime.mts` builds the upstream runtime and its shared module registries. Preserve Equicord's original import evaluation order. Register local renderer plugins immediately before upstream `initPluginManager`, not before the initial `~plugins` import graph finishes.

`src/excord/compiler.ts` owns folder discovery, content fingerprints, per-plugin builds, shared API resolution, CSS and file imports, and cache cleanup. The compiler loads lazily. In packaged apps its executable must run from `app.asar.unpacked`.

`src/excord/service.ts` owns the privileged desktop API, native helper registration and replacement, serialized refreshes, and on-demand process metrics. `src/excord/runtime.ts` registers renderer definitions before the upstream plugin manager initializes.

`src/main/arrpc` runs the existing Node arRPC server in an Electron worker only when enabled. Do not reintroduce a standalone Bun runtime. RPC and process scanning default to off. `src/excord/efficiency.ts` adds the optional ExcordEfficiency plugin.

`src/excord/ControlCenter.tsx` presents local plugins, metrics, and compatibility information inside Discord settings. Desktop settings below it retain the inherited hardware, tray, notification, theme, and window controls.

## Release boundaries

The repository is currently private at github.com/extoci/excord. Do not change its visibility without the user's instruction. Native build workflows upload private CI artifacts. Tag releases and the manual draft workflow use GitHub Releases and electron-updater metadata. The project does not host a plugin catalog or an update server. See `docs/releases.md` for release steps and signing limits.

Never describe every plugin or voice/screen-share behavior as verified merely because the catalog builds. Live account behavior and physical device permissions need separate tests. Current retained upstream mechanisms and known costs belong in the compatibility record.
