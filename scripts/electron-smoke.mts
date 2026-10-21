import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron } from "playwright-core";

const require = createRequire(import.meta.url);
const packagedApp = process.platform === "darwin" ? "dist/mac-arm64/Excord.app/Contents/Resources/app.asar"
    : process.platform === "win32" ? "dist/win-unpacked/resources/app.asar" : "dist/linux-unpacked/resources/app.asar";
const profile = await mkdtemp(join(tmpdir(), "excord-smoke-"));
const plugin = join(profile, "plugins/refresh-probe");
await mkdir(plugin, { recursive: true });
const source = (value: string) => `import definePlugin, { StartAt } from "@utils/types";
import NoTrack from "@plugins/_core/noTrack";
export default definePlugin({
    name: "ExcordRefreshProbe", description: "Tests refresh and native IPC", authors: [{name:"Excord",id:0n}],
    enabledByDefault: true, startAt: StartAt.DOMContentLoaded,
    start() { globalThis.__excordProbe = ${JSON.stringify(value)}; globalThis.__excordSharedCore = NoTrack.name; VencordNative.pluginHelpers.ExcordRefreshProbe.echo(${JSON.stringify(value)}).then(value => globalThis.__excordNativeProbe = value); },
    patches: [{find:"EXCORD_SMOKE_UNUSED_PATCH",replacement:{match:/unused/,replace:"unused"}}]
});`;
await writeFile(join(plugin, "index.ts"), source("first"));
await writeFile(join(plugin, "native.ts"), 'import { SETTINGS_DIR } from "@main/utils/constants"; export function echo(_event: unknown, value: string) { return "native:" + value; } export function settingsPath() { return SETTINGS_DIR; }');
const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
delete environment.ELECTRON_RUN_AS_NODE;
environment.EXCORD_USER_DATA_DIR = profile;
console.log(`[smoke] Launching Electron on ${process.platform}/${process.arch}`);
let stopHungApplication = () => {};
const deadline = setTimeout(() => {
    console.error("[smoke] The Electron test exceeded its three-minute deadline");
    stopHungApplication();
    process.exit(1);
}, 180000);
deadline.unref();
const application = await _electron.launch({ executablePath: require("electron"),
    args: [...(process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : []), resolve(process.env.EXCORD_SMOKE_APP ?? (process.argv.includes("--packaged") ? packagedApp : "."))],
    env: environment, timeout: 30000 });
console.log("[smoke] Electron launched");
stopHungApplication = () => { application.process().kill(); };
const errors: string[] = [];
let telemetryBlocks = 0;
let mainOutput = "";
application.on("console", message => { mainOutput = (mainOutput + message.text() + "\n").slice(-16000); });
application.process().stdout?.on("data", data => { mainOutput = (mainOutput + String(data)).slice(-16000); });
application.process().stderr?.on("data", data => { mainOutput = (mainOutput + String(data)).slice(-16000); });
try {
    const page = await application.firstWindow();
    page.setDefaultTimeout(30000);
    console.log("[smoke] Window created");
    page.on("pageerror", error => {
        if (error.message === "Sentry successfully disabled") { telemetryBlocks++; return; }
        errors.push(error.stack ?? error.message); console.error("[renderer error]", error.stack ?? error.message);
    });
    page.on("console", message => {
        if (message.type() === "error" && /Excord|Vencord|Equicord/.test(message.text())) console.error("[renderer]", message.text().slice(0, 500));
    });
    await page.waitForFunction(() => (globalThis as Record<string, unknown>).__excordProbe === "first", undefined, { timeout: 30000 });
    await page.waitForFunction(() => (globalThis as Record<string, unknown>).__excordNativeProbe === "native:first", undefined, { timeout: 30000 });
    console.log("[smoke] Renderer and native probe loaded");
    const initial = await page.evaluate(() => ({
        native: typeof ExcordNative,
        experimentsEnabled: Vencord.Plugins.isPluginEnabled("Experiments"),
        experimentsDefault: Vencord.Plugins.plugins.Experiments.enabledByDefault,
        local: ExcordNative.getLocalPlugins().plugins.map(plugin => ({ folder: plugin.folder, cacheHit: plugin.cacheHit })),
        moduleCount: Object.keys(ExcordModules).length,
        plugins: Object.keys(Vencord.Plugins.plugins).length,
        hasPatch: Vencord.WebpackPatcher.patches.some((patch: { plugin: string }) => patch.plugin === "ExcordRefreshProbe")
    }));
    assert.equal(initial.native, "object");
    assert.equal(await page.evaluate(() => {
        const plugin = Vencord.Plugins.plugins.ExcordFavorites;
        return !!plugin && plugin.enabledByDefault === true
            && typeof plugin.renderSidebar === "function"
            && plugin.dependencies?.includes("ServerListAPI");
    }), true, "Favorites must register with the native sidebar integration and ServerListAPI dependency");
    const favoritesUI = await page.evaluate(async () => {
        const webpack = ExcordModules["@webpack"] as typeof import("@equicord/types/webpack");
        const common = ExcordModules["@webpack/common"] as typeof import("@equicord/types/webpack/common");
        const serverList = ExcordModules["@api/ServerList"] as typeof import("@equicord/types/api/ServerList");
        const favorites = Vencord.Plugins.plugins.ExcordFavorites;
        const originalCapture = favorites.captureCategory;
        let captured = 0;
        favorites.captureCategory = component => { captured++; return originalCapture(component); };
        const host = document.createElement("div");
        host.style.cssText = "position:fixed;top:0;left:0;width:var(--custom-guild-list-width);z-index:999999";
        document.body.append(host);
        const root = common.createRoot(host);
        try {
            // Signed-out startup does not load the guild route. Load its real
            // chunks, including the earlier tutorial registry that used to
            // consume Favorites' one-shot patch. Never inject a category stub.
            await webpack.extractAndLoadChunks(["GuildSettingsActionCreators"]);
            const loaded = await webpack.extractAndLoadChunks(['name:"GuildSidebar"'], /createPromise:\(\)=>Promise\.all\(\[([^\]]+)\]\)\.then\(\i\.bind\(\i,(\d+)\)\),webpackId:\d+,name:"GuildSidebar"/);
            root.render(common.React.createElement(common.React.Fragment, null, ...serverList.renderAll(0)));
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            const button = host.querySelector('[data-excord-favorites="true"][tabindex]');
            const icon = button?.querySelector("svg");
            const item = button?.closest('[class*="listItem_"]');
            const iconBounds = icon?.getBoundingClientRect(), itemBounds = item?.getBoundingClientRect();
            return { loaded, captured, centered: !!iconBounds && !!itemBounds && iconBounds.width > 0 && itemBounds.width > iconBounds.width
                && Math.abs(iconBounds.x + iconBounds.width / 2 - itemBounds.x - itemBounds.width / 2) < 1 };
        } finally {
            favorites.captureCategory = originalCapture;
            root.unmount(); host.remove();
        }
    });
    assert.equal(favoritesUI.loaded, true, "Discord's guild sidebar chunks must load");
    assert.ok(favoritesUI.captured > 0, "The production category patch must capture Discord's real component after tutorial modules load");
    assert.equal(favoritesUI.centered, true, "Favorites must use the native rail item wrapper and remain centered");
    console.log("[smoke] Favorites captured the real native category and its rail icon is centered");
    assert.equal(await page.evaluate(() => Object.hasOwn(Vencord.Plugins.plugins, "ExcordVisualizations")), true,
        "Favorites must coexist with the Visualizations plugin");
    assert.equal(await page.evaluate(() => Vencord.Plugins.isPluginEnabled("ExcordVisualizations")), false,
        "HTML visualizations must be opt-in on fresh profiles");
    assert.equal(await page.evaluate(() => Vencord.Plugins.plugins.ExcordVisualizations.enabledByDefault), false);
    assert.equal(await page.evaluate(() => Object.hasOwn(Vencord.Plugins.plugins, "NewPluginsManager")), false,
        "Excord must never register plugin announcements");
    assert.equal(initial.experimentsEnabled, true, "Fresh profiles must enable Experiments");
    assert.equal(initial.experimentsDefault, true);
    assert.ok(initial.plugins > 300, `Expected the bundled catalog, received ${initial.plugins} plugins`);
    assert.ok(initial.moduleCount > 100);
    assert.equal(initial.hasPatch, true);
    assert.equal(initial.local[0].cacheHit, false);
    assert.equal(await page.evaluate(() => (globalThis as Record<string, unknown>).__excordSharedCore), "NoTrack");
    assert.equal(await page.evaluate(() => VencordNative.pluginHelpers.ExcordRefreshProbe.settingsPath()), join(profile, "settings"));
    assert.equal(await page.evaluate(() => VesktopNative.settings.get().arRPCDisabled), true);

    await page.evaluate(async () => {
        Vencord.Settings.plugins.NewPluginsManager = { enabled: true };
        Vencord.Settings.plugins.Experiments.enabled = false;
        await VencordNative.settings.set(JSON.parse(JSON.stringify(Vencord.Settings)), "plugins.Experiments.enabled");
    });
    await writeFile(join(plugin, "index.ts"), source("second"));
    await Promise.all([page.waitForEvent("domcontentloaded"), application.evaluate(({ Menu, BrowserWindow }) => {
        const item = Menu.getApplicationMenu()!.getMenuItemById("excord-refresh")!;
        if (item.accelerator !== "CmdOrCtrl+R") throw new Error("The refresh shortcut must compile local plugins");
        item.click(item, BrowserWindow.getAllWindows()[0], {} as KeyboardEvent);
    })]);
    await page.waitForFunction(() => (globalThis as Record<string, unknown>).__excordProbe === "second", undefined, { timeout: 30000 });
    await page.waitForFunction(() => (globalThis as Record<string, unknown>).__excordNativeProbe === "native:second", undefined, { timeout: 30000 });
    assert.equal(await page.evaluate(() => Vencord.Plugins.isPluginEnabled("Experiments")), false, "Refreshing must preserve a saved disabled choice");
    assert.equal(await page.evaluate(() => Object.hasOwn(Vencord.Plugins.plugins, "NewPluginsManager")), false,
        "Saved enabled settings must not restore plugin announcements on refresh");
    console.log("[smoke] Menu refresh loaded changed source and preserved the Experiments choice");

    await Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => { void ExcordNative.refresh(); })]);
    await page.waitForFunction(() => ExcordNative.getLocalPlugins().plugins[0]?.cacheHit === true, undefined, { timeout: 30000 });
    assert.equal(await page.evaluate(() => ExcordNative.getLocalPlugins().issues.length), 0);
    console.log("[smoke] Unchanged source used the cache");

    await writeFile(join(plugin, "index.ts"), "export default { invalid !!!");
    await Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => { void ExcordNative.refresh(); })]);
    await page.waitForFunction(() => ExcordNative.getLocalPlugins().issues.some(issue => issue.folder === "refresh-probe"), undefined, { timeout: 30000 });
    assert.equal(await page.evaluate(() => ExcordNative.getLocalPlugins().plugins.length), 0);
    assert.equal(await page.evaluate(() => typeof Vencord.Plugins.plugins.NoTrack), "object");
    console.log("[smoke] Syntax error isolated");
    await writeFile(join(plugin, "index.ts"), source("recovered"));
    await Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => { void ExcordNative.refresh(); })]);
    await page.waitForFunction(() => (globalThis as Record<string, unknown>).__excordNativeProbe === "native:recovered", undefined, { timeout: 30000 });
    console.log("[smoke] Corrected source recovered");
    const cssNotifications = await page.evaluate(() => new Promise<number>((resolve, reject) => {
        let count = 0;
        let settled: ReturnType<typeof setTimeout>;
        const deadline = setTimeout(() => reject(new Error("QuickCSS did not update")), 5000);
        VencordNative.quickCss.addChangeListener(() => {
            count++;
            clearTimeout(settled);
            settled = setTimeout(() => { clearTimeout(deadline); resolve(count); }, 250);
        });
        void VencordNative.quickCss.set("/* Excord watcher regression probe */");
    }));
    assert.equal(cssNotifications, 1, "Refreshing must replace QuickCSS watchers instead of accumulating them");
    console.log("[smoke] QuickCSS emitted one update after repeated refreshes");
    const auxiliaryWindow = application.waitForEvent("window");
    const auxiliaryId = await application.evaluate(({ app, BrowserWindow }) => {
        const window = new BrowserWindow({ show: false, webPreferences: {
            preload: process.getBuiltinModule("path").join(app.getAppPath(), "static", "runtime", "preload.js"),
            sandbox: false, contextIsolation: true, backgroundThrottling: false
        } });
        void window.loadURL("https://discord.com/login");
        return window.id;
    });
    const auxiliary = await auxiliaryWindow;
    await auxiliary.waitForURL("https://discord.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    await auxiliary.waitForFunction(() => typeof VencordNative !== "undefined", undefined, { timeout: 30000 });
    for (const window of [page, auxiliary]) await window.evaluate(() => {
        (globalThis as Record<string, unknown>).__excordCssUpdates = 0;
        VencordNative.quickCss.addChangeListener(() => {
            (globalThis as Record<string, number>).__excordCssUpdates++;
        });
    });
    await page.evaluate(() => VencordNative.quickCss.set("/* Excord multiple-window probe */"));
    for (const window of [page, auxiliary]) await window.waitForFunction(() =>
        (globalThis as Record<string, unknown>).__excordCssUpdates === 1, undefined, { timeout: 5000 });
    await application.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), auxiliaryId);
    await page.evaluate(() => VencordNative.quickCss.set("/* Excord remaining-window probe */"));
    await page.waitForFunction(() => (globalThis as Record<string, unknown>).__excordCssUpdates === 2, undefined, { timeout: 5000 });
    console.log("[smoke] CSS updates reach both windows and survive closing one");
    const diagnostics = await page.evaluate(() => ExcordNative.diagnostics());
    await mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/electron-login.png" });
    assert.deepEqual(errors, []);
    assert.doesNotMatch(mainOutput, /UnhandledPromiseRejection/);
    await writeFile("test-results/electron-smoke.json", JSON.stringify({ initial, diagnostics, errors, telemetryBlocks }, null, 2));
    console.log(JSON.stringify({ status: "passed", initial, startupMs: diagnostics.startupMs, errors, telemetryBlocks }, null, 2));
} catch (error) {
    await mkdir("test-results", { recursive: true });
    const page = application.windows()[0];
    if (page) {
        await page.screenshot({ path: "test-results/electron-failure.png", timeout: 5000 }).catch(() => {});
        const state = await page.evaluate(() => ({ url: location.href, title: document.title, text: document.body?.innerText?.slice(0, 500),
            native: typeof ExcordNative, modules: typeof ExcordModules, runtime: typeof Vencord, wrapper: typeof (globalThis as Record<string, unknown>).Excord,
            probe: (globalThis as Record<string, unknown>).__excordProbe,
            localIssues: typeof ExcordNative === "undefined" ? [] : ExcordNative.getLocalPlugins().issues })).catch(String);
        console.error(JSON.stringify({ state, errors, mainOutput }, null, 2));
    }
    throw error;
} finally {
    console.log("[smoke] Closing Electron");
    const quitMarker = join(profile, "automation-quit");
    await application.evaluate(({ app }, marker) => {
        for (const event of ["before-quit", "will-quit", "quit"] as const)
            app.on(event, () => console.log(`[smoke] App event: ${event}`));
        app.once("quit", () => process.getBuiltinModule("fs").writeFileSync(marker, "quit"));
    }, quitMarker).catch(() => {});
    application.process().on("exit", (code, signal) => console.log("[smoke] Electron process exit", code, signal));
    let cleanupTimedOut = false;
    const shutdown = setTimeout(() => {
        let reachedQuit = false;
        try { reachedQuit = readFileSync(quitMarker, "utf8") === "quit"; } catch {}
        const knownWindowsTeardown = process.platform === "win32" && reachedQuit;
        cleanupTimedOut = !knownWindowsTeardown;
        if (knownWindowsTeardown) console.log("[smoke] Terminating the Windows automation host after its recorded quit event; normal shutdown is verified separately");
        console.error("[smoke] Shutdown output", mainOutput);
        if (process.platform === "win32" && application.process().pid) {
            try { execFileSync("taskkill", ["/pid", String(application.process().pid), "/T", "/F"], { timeout: 5000 }); }
            catch { /* The process may have exited while diagnostics were being collected. */ }
        } else application.process().kill();
    }, 10000);
    shutdown.unref();
    await application.close().catch(() => {});
    console.log("[smoke] Electron closed");
    clearTimeout(shutdown);
    clearTimeout(deadline);
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
    assert.equal(cleanupTimedOut, false, "Browser automation cleanup timed out before a recorded quit event");
}
