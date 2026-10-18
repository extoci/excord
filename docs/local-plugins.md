# Local TypeScript plugins

Open Discord Settings, then Excord Settings. Create a plugin or open the plugins folder and copy in a folder with `index.ts` or `index.tsx`.

The default locations are `~/Library/Application Support/excord/plugins` on macOS and `%APPDATA%/excord/plugins` on Windows. A portable Windows build stores them beside the executable in `Data/plugins`. The Open plugins folder button always opens the location that this instance uses.

## A minimal plugin

```ts
import definePlugin from "@utils/types";

export default definePlugin({
    name: "MyPersonalPlugin",
    description: "My personal changes to Discord",
    authors: [{ name: "Me", id: 0n }],
    start() {
        console.log("MyPersonalPlugin started");
    },
    stop() {
        console.log("MyPersonalPlugin stopped");
    }
});
```

Edit the source, then press Cmd+R on macOS or Ctrl+R on Windows. Excord recompiles changed folders and refreshes Discord. It does not restart the desktop process. The View menu and the Refresh Excord button use the same compilation path. Shift+Cmd+R or Shift+Ctrl+R also bypasses the browser cache.

Local plugins default to enabled unless they set `enabledByDefault: false`. The regular Equicord Plugins page controls their enabled state and settings. Excord's page reports folder compilation and registration errors. A broken folder does not prevent other folders from compiling.

## Reuse the upstream API

Use `@api/Settings`, `@api/Commands`, `@webpack/common`, `@utils/types`, and the other modules exported by the bundled runtime. JSX uses Discord's React instance. Plugins can declare patches, dependencies, Flux handlers, context menus, settings, and managed CSS in the usual Equicord format.

Import local helpers with relative paths. Excord also exposes the renderer plugin helper modules that the bundled target already imports. An unavailable import is a compilation error. See [the compatibility record](compatibility.md) for the exact boundaries.

Excord transpiles local TypeScript rather than rejecting plugins for type errors. Excord's own code uses strict TypeScript checking. This keeps existing upstream plugin source usable when its types are incomplete.

## Native helpers

Put helper functions in `native.ts` or `native/index.ts` beside the renderer entry. Use a literal plugin name as the first field in `definePlugin`, as upstream's native build does. Call the helpers through `VencordNative.pluginHelpers.YourPluginName`. Equicord passes the Electron IPC event as the first argument to each helper.

```ts
// native.ts
import { platform } from "node:os";

export function getPlatform() {
    return platform();
}
```

```ts
const platform = await VencordNative.pluginHelpers.MyPersonalPlugin.getPlatform();
```

Native helpers share the bundled native settings and utilities. If a module creates timers, watchers, or other persistent resources, export a `__excordDispose` function to clean them up before a refresh replaces the module. Normal renderer resources disappear when Discord refreshes; use a plugin's `stop` method for resources that must also stop when the user disables it.

## Compilation and cache behavior

Excord fingerprints source contents, not just modification times. It caches unchanged self-contained plugins and removes obsolete compiled artifacts. Dependencies outside the folder, including installed npm packages, cause a rebuild on refresh so edits do not leave a stale cache.

Source folders can contain up to 2,000 files and 32 MiB of source and assets. Excord ignores `.git`, `node_modules`, and `dist` while fingerprinting. It reports symbolic links as unsupported. The folder does not need a package manifest or a build command.

Native modules execute Node code on your computer, and renderer plugins execute in your Discord session. Only install source you trust.
