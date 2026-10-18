import { app, type BrowserWindow, ipcMain, shell, type WebFrameMain } from "electron";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { DATA_DIR } from "../main/constants";
import { STATIC_DIR } from "../shared/paths";
import { ExcordChannels } from "./channels";
import { createLocalPlugin, LocalPluginCompiler } from "./compiler";
import { isDiscordOrigin } from "./origin";
import type { LocalPluginSnapshot, PerformanceSnapshot, PluginIssue, RuntimeModuleManifest } from "./types";

const manifest: RuntimeModuleManifest = JSON.parse(readFileSync(join(STATIC_DIR, "runtime/modules.json"), "utf8"));
export const localPluginsDirectory = join(DATA_DIR, "plugins");
const compiler = new LocalPluginCompiler(localPluginsDirectory, join(DATA_DIR, "plugin-cache"), manifest);
app.on("will-quit", () => compiler.shutdown());
const requireNative = createRequire(__filename);
// spawn() cannot execute a path inside ASAR. Point esbuild at its unpacked binary.
if (STATIC_DIR.includes(".asar") && !process.env.ESBUILD_BINARY_PATH) {
    const binary = process.platform === "win32" ? `@esbuild/win32-${process.arch}/esbuild.exe`
        : `@esbuild/${process.platform}-${process.arch}/bin/esbuild`;
    process.env.ESBUILD_BINARY_PATH = requireNative.resolve(binary).replace(/\.asar([/\\])/, ".asar.unpacked$1");
}

interface NativeRegistry {
    modules: Record<string, unknown>;
    registerPluginNatives(name: string, methods: Record<string, (...args: unknown[]) => unknown>): void;
    unregisterPluginNatives(name: string): void;
}

let snapshot: LocalPluginSnapshot = { plugins: [], issues: [], preparedAt: "", durationMs: 0 };
let startupMs: number | null = null;
let currentWindow: BrowserWindow | undefined;
let refreshInProgress: Promise<void> | undefined;
const nativePlugins = new Map<string, { path: string; dispose?: () => unknown }>();

function assertSender(frame: WebFrameMain | null) {
    if (!frame || frame.parent || !isDiscordOrigin(frame.url)) throw new Error("Excord requires the main Discord frame.");
}

export async function prepareLocalPlugins() {
    const native: NativeRegistry = requireNative(join(STATIC_DIR, "runtime/main.js"));
    globalThis.ExcordNativeModules = native.modules;
    for (const [name, entry] of nativePlugins) {
        try { await entry.dispose?.(); }
        catch (error) { console.error(`[Excord] Native cleanup failed for ${name}`, error); }
        native.unregisterPluginNatives(name);
        delete requireNative.cache[entry.path];
    }
    nativePlugins.clear();
    snapshot = await compiler.prepare();
    for (const plugin of snapshot.plugins) {
        if (!plugin.nativePath || !plugin.nativePluginName) continue;
        try {
            const exports: Record<string, unknown> = requireNative(plugin.nativePath);
            const methods = Object.fromEntries(Object.entries(exports).filter(([name, value]) => name !== "__excordDispose" && typeof value === "function")) as Record<string, (...args: unknown[]) => unknown>;
            native.registerPluginNatives(plugin.nativePluginName, methods);
            nativePlugins.set(plugin.nativePluginName, { path: plugin.nativePath,
                ...(typeof exports.__excordDispose === "function" ? { dispose: exports.__excordDispose as () => unknown } : {}) });
        } catch (error) {
            snapshot.issues.push({ folder: plugin.folder, phase: "native", message: error instanceof Error ? error.message : String(error) });
            // Do not run a renderer plugin whose native dependencies failed to load.
            plugin.code = "";
        }
    }
    snapshot.plugins = snapshot.plugins.filter(plugin => plugin.code !== "");
}

export function refreshExcord(win = currentWindow, ignoreCache = false): Promise<void> {
    if (!win || win.isDestroyed()) return Promise.resolve();
    return refreshInProgress ??= prepareLocalPlugins().then(() => {
        if (!win.isDestroyed()) {
            if (ignoreCache) win.webContents.reloadIgnoringCache();
            else win.webContents.reload();
        }
    }).finally(() => { refreshInProgress = undefined; });
}

export function attachExcord(win: BrowserWindow) {
    currentWindow = win;
    win.webContents.once("did-finish-load", () => { startupMs ??= process.uptime() * 1000; });
    win.webContents.on("before-input-event", (event, input) => {
        if (input.type !== "keyDown") return;
        const refresh = input.key === "F5" || ((input.control || input.meta) && !input.alt && input.key.toLowerCase() === "r");
        if (refresh) {
            event.preventDefault();
            void refreshExcord(win, input.shift).catch(error => console.error("[Excord] Refresh failed", error));
        }
    });
}

export function getDiagnostics(): PerformanceSnapshot {
    return {
        startupMs, uptimeSeconds: process.uptime(),
        processes: app.getAppMetrics().map(metric => ({ type: metric.type, cpuPercent: metric.cpu.percentCPUUsage,
            memoryMiB: metric.memory.workingSetSize / 1024 })),
        localPlugins: { ...snapshot, plugins: snapshot.plugins.map(plugin => ({ ...plugin, code: "" })) },
        upstream: { commit: manifest.revision, version: String(manifest.defines.VERSION) }
    };
}

ipcMain.on(ExcordChannels.localPlugins, event => {
    try { assertSender(event.senderFrame); event.returnValue = snapshot; }
    catch { event.returnValue = { plugins: [], issues: [], preparedAt: "", durationMs: 0 }; }
});
ipcMain.on(ExcordChannels.reportIssues, (event, issues: unknown) => {
    assertSender(event.senderFrame);
    if (!Array.isArray(issues)) return;
    const parsed = issues.filter((issue): issue is PluginIssue => !!issue && typeof issue === "object"
        && typeof issue.folder === "string" && typeof issue.message === "string" && issue.phase === "load");
    snapshot.issues.push(...parsed.slice(0, 100));
    const failed = new Set(parsed.map(issue => issue.folder));
    snapshot.plugins = snapshot.plugins.filter(plugin => !failed.has(plugin.folder));
});
ipcMain.handle(ExcordChannels.openPlugins, async event => {
    assertSender(event.senderFrame);
    const error = await shell.openPath(localPluginsDirectory);
    if (error) throw new Error(error);
});
ipcMain.handle(ExcordChannels.createPlugin, async (event, name: unknown) => {
    assertSender(event.senderFrame);
    if (typeof name !== "string") throw new Error("A plugin folder name is required.");
    const directory = await createLocalPlugin(localPluginsDirectory, name);
    const error = await shell.openPath(directory);
    if (error) console.warn("[Excord] Could not open the new plugin folder:", error);
    return directory;
});
ipcMain.handle(ExcordChannels.refresh, async event => { assertSender(event.senderFrame); await refreshExcord(); });
ipcMain.handle(ExcordChannels.diagnostics, event => { assertSender(event.senderFrame); return getDiagnostics(); });
ipcMain.handle(ExcordChannels.openSettings, async event => {
    assertSender(event.senderFrame);
    await currentWindow?.webContents.executeJavaScript('Vencord.Webpack.Common.SettingsRouter.openUserSettings("ExcordSettings")');
});
