import { expect, test } from "bun:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

import { IpcEvents } from "../src/shared/IpcEvents";

const result = await build({ entryPoints: ["src/preload/index.ts"], bundle: true, write: false,
    platform: "node", format: "cjs", external: ["electron/renderer"], define: { IS_DEV: "false" } });
const source = result.outputFiles[0].text;
function sandbox(isMainFrame = true, url = "https://discord.com/login") {
    const exposed: string[] = [];
    const injected: string[] = [];
    const electron = {
        contextBridge: { exposeInMainWorld(name: string) { exposed.push(name); } },
        ipcRenderer: { on() {}, sendSync(event: string) {
            if (event === IpcEvents.GET_VENCORD_PRELOAD_SCRIPT) return "globalThis.preloadRan = process.isMainFrame && typeof require('electron/renderer').ipcRenderer === 'object';";
            if (event === IpcEvents.GET_VENCORD_RENDERER_SCRIPT) return "upstream-renderer";
            if (event === IpcEvents.GET_VESKTOP_RENDERER_SCRIPT) return "desktop-renderer";
            throw Error(`Unexpected sync request: ${event}`);
        } },
        webFrame: { executeJavaScript(script: string) { injected.push(script); } }
    };
    const scope = { URL, location: { href: url }, process: { isMainFrame }, require: (name: string) => {
        if (name !== "electron/renderer") throw Error(`Sandbox module unavailable: ${name}`);
        return electron;
    }, preloadRan: false };
    // Electron 45 exposes no Buffer, setImmediate, or clearImmediate in this world.
    runInNewContext(source, scope);
    return { exposed, injected, preloadRan: scope.preloadRan };
}
test("sandboxed bootstrap works without removed Electron 45 globals", () => {
    const state = sandbox();
    expect(state.preloadRan).toBe(true);
    expect(state.exposed).toEqual(["ExcordNative", "VesktopNative"]);
    expect(state.injected).toEqual(["upstream-renderer", "desktop-renderer"]);
});
test("subframes and unrelated pages receive no desktop bridge or runtime", () => {
    for (const state of [sandbox(false), sandbox(true, "https://example.com/")]) {
        expect(state.exposed).toEqual([]);
        expect(state.injected).toEqual([]);
        expect(state.preloadRan).toBe(false);
    }
});
