# Compatibility record

Excord v0 keeps Equicord's plugin manager, Webpack interception and patching, settings store, UI APIs, native helpers, and bundled plugin definitions. This is intentional. Excord has not demonstrated that rewriting those components would improve runtime performance without breaking plugins.

The desktop integration derives from Equibop and Vesktop. Excord retains its screen-share picker, voice integrations, notifications, tray, themes, RPC integration, popouts, and window controls. Those integrations need separate verification on each target operating system.

Excord replaces Equibop's standalone Bun RPC executable with the Node arRPC server used by Vesktop, running in an Electron worker. The Linux helper changed from 98,899,144 bytes to roughly 60,000 bytes of JavaScript. This removes a second language runtime from the distribution. RPC and process scanning remain off until enabled. Excord retains an external loopback RPC connection option.

## Local plugin loading

Each folder in the user's plugins directory has an `index.ts` or `index.tsx` entry. A plugin exports the same `definePlugin` definition that Equicord accepts. Excord registers it before Equicord initializes its plugin manager. This preserves dependency activation, settings defaults, patch canonicalization, and lifecycle stages.

Excord's compiler links `@api`, `@components`, `@utils`, `@shared`, `@webpack`, their bundled submodules, and `~plugins` to the existing runtime. It also exposes `@plugins`, `@equicordplugins`, and `@debug` modules that already belong to this target's renderer build. It does not create a separate settings store or React instance for each plugin. Local JSX uses Discord's React. Managed CSS uses the same style registry as the bundled plugins. `file://` imports can load files from the plugin folder.

The runtime exports more module definitions to support local imports. This retains some exports that a normal Equicord build could remove. That bundle and initialization cost is a known compatibility tradeoff. `static/runtime/bundle-report.json` records generated renderer sizes.

Excord v0 does not support replacing its bundled runtime with an arbitrary Equicord build. Its native and renderer module registries must match the pinned revision. Personal plugins use the local folder instead. Some inherited upstream plugin prompts still offer a full application restart; Excord's local folder refresh and View menu avoid restarting the desktop process.

Excord compiles folders separately. A syntax error skips the broken folder and reports an error; it does not execute an old cached version. Plugin names must not collide with bundled plugins. Local plugins default to enabled, and users can disable them in the normal plugin settings.

## Native helpers

An optional `native.ts` or `native/index.ts` exports native helper functions. Excord registers them through Equicord's `VencordNative.pluginHelpers` mechanism before the renderer preload reads its IPC method map.

Like Equicord's source build, a local plugin with native helpers needs a literal plugin name as the first property of `definePlugin`. Excord replaces its native IPC registrations on refresh. A native module can export `__excordDispose` to remove its timers, watchers, or other resources before replacement. Excord cannot infer how to undo arbitrary side effects inside a native module.

Native Node built-ins and Electron imports work. Native helpers can import the bundled `@main/settings`, `@main/csp`, `@main/utils` submodules, and `@shared` modules through the same native runtime. Unknown imports fail with a compilation error instead of a stub implementation.

## Compatibility is not a universal runtime guarantee

The bundled catalog uses Equicord's normal desktop-wrapper target exclusions. Discord-desktop-only plugins may require native modules that neither the website nor a wrapper provides. Plugins can also break when Discord changes its JavaScript modules. Excord does not claim to have verified every plugin's behavior with a signed-in account.

The initial live Electron smoke test loaded 381 plugin definitions in total, including internal plugins and one local probe. It checked the local probe's patch registration and native IPC, changed its source, refreshed, checked cache reuse, introduced a syntax error, and recovered after fixing it. This checks the loading mechanism, not every catalog plugin.

## Updates

Excord bundles the exact Equicord revision in `upstream.lock.json`. It does not fetch a different runtime at startup or run Equicord's independent updater. Excord releases update the desktop app and bundled catalog together. Excord does not host a plugin catalog service.
