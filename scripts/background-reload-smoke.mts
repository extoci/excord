import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { _electron } from "playwright-core";
import { useNativeVisibility } from "./utils/nativeVisibility.mts";

// Real BrowserWindow + production background policy. Fake settings, local HTML,
// disposable profile, and a network deny rule. No Discord requests or account.
const withRuntime = process.argv.includes("--with-runtime");
const nativeRuntime = resolve("static/runtime/main.js");
const root = await mkdtemp(join(tmpdir(), "excord-offline-reload-"));
const idleMs = Number(process.argv.find(arg => arg.startsWith("--idle-ms="))?.split("=")[1] ?? 1000);
assert.ok(Number.isFinite(idleMs) && idleMs >= 0 && idleMs <= 600000);
const stub = { name: "isolated-background-dependencies", setup(context: import("esbuild").PluginBuild) {
    context.onLoad({ filter: /[/\\]main[/\\]settings\.ts$/ }, () => ({ contents: `export const Settings = {store:{backgroundEfficiency:true}, addChangeListener(){}, removeChangeListener(){}};`, loader: "ts" }));
    context.onLoad({ filter: /[/\\]main[/\\]events\.ts$/ }, () => ({ contents: `import { EventEmitter } from "node:events"; export const AppEvents = new EventEmitter();`, loader: "ts" }));
} };
await build({ stdin: { contents: `
import { app, BrowserWindow, ipcMain, session } from "electron";
import { attachBackgroundPolicy, setRealtimeActivity } from ${JSON.stringify(resolve("src/main/background.ts"))};
void (async () => {
app.setPath("userData", ${JSON.stringify(join(root, "profile"))});
process.env.EQUICORD_USER_DATA_DIR = ${JSON.stringify(join(root, "profile"))};
${withRuntime ? `require(${JSON.stringify(nativeRuntime)});` : ""}
await app.whenReady();
session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({cancel: !details.url.startsWith("file:")}));
const win = new BrowserWindow({show:true, webPreferences:{preload:${JSON.stringify(join(root, "preload.cjs"))}, sandbox:true, contextIsolation:true, backgroundThrottling:true}});
attachBackgroundPolicy(win);
ipcMain.on("fixture-activity", (event, active) => { if(event.sender===win.webContents) setRealtimeActivity(win, active); });
await win.loadFile(${JSON.stringify(join(root, "host.html"))});
})();
`, resolveDir: process.cwd(), sourcefile: "background-native-main.mts", loader: "ts" }, outfile: join(root, "main.cjs"), bundle: true, platform: "node", format: "cjs", external: ["electron", nativeRuntime], plugins: [stub] });
await writeFile(join(root, "preload.cjs"), `const {contextBridge,ipcRenderer}=require("electron");contextBridge.exposeInMainWorld("Fixture",{activity:active=>ipcRenderer.send("fixture-activity",active)});` + (withRuntime ? await readFile("static/runtime/preload.js", "utf8") : ""));
await writeFile(join(root, "host.html"), `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline'"><title>Offline reload fixture</title><p>Local reload fixture</p><script>requestAnimationFrame(()=>{document.documentElement.dataset.painted="true";});</script>`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({executablePath:process.env.EXCORD_ELECTRON_EXECUTABLE ?? createRequire(import.meta.url)("electron"), env,
    args:[...(process.platform === "linux" ? ["--no-sandbox","--disable-gpu","--ozone-platform=headless"] : []),join(root,"main.cjs")],timeout:30000});
const deadline = setTimeout(() => { app.process().kill(); console.error("Offline reload test timed out"); process.exit(1); }, idleMs + 90000);
deadline.unref();
try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    await useNativeVisibility(page);
    const native = () => app.evaluate(({BrowserWindow}) => {const win=BrowserWindow.getAllWindows()[0];return {visible:win.isVisible(),throttling:win.webContents.getBackgroundThrottling()};});
    assert.equal((await native()).throttling,true);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
    await page.evaluate(()=>(globalThis as any).Fixture.activity(true));
    await delay(50);
    assert.equal((await native()).throttling,false,"Active media must disable background throttling");
    await page.evaluate(()=>(globalThis as any).Fixture.activity(false));
    await delay(50);
    assert.equal((await native()).throttling,false,"Re-enabling while hidden must be deferred");
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
    assert.equal((await native()).throttling,true);
    const samples=[];
    for(let cycle=0;cycle<5;cycle++) {
        await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
        await delay(cycle===0?idleMs:100);
        const loaded=page.waitForEvent("load");
        await page.evaluate(()=>{setTimeout(()=>location.reload(),0);});
        await loaded;
        await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
        await page.waitForFunction(()=>document.documentElement.dataset.painted==="true");
        assert.equal(await page.evaluate(()=>document.hidden),false);
        samples.push(await app.evaluate(({app})=>({electron:process.versions.electron,processes:app.getAppMetrics().map(p=>({type:p.type,memoryMiB:p.memory.workingSetSize/1024}))})));
    }
    if (withRuntime) {
        await page.waitForFunction(() => typeof VencordNative !== "undefined");
        await delay(100);
        const notifications = await page.evaluate(() => new Promise<number>((resolve, reject) => {
            let count = 0;
            let settled: ReturnType<typeof setTimeout>;
            const timeout = setTimeout(() => reject(Error("QuickCSS did not update")), 5000);
            VencordNative.quickCss.addChangeListener(() => {
                count++;
                clearTimeout(settled);
                settled = setTimeout(() => { clearTimeout(timeout); resolve(count); }, 250);
            });
            void VencordNative.quickCss.set("/* offline watcher regression */");
        }));
        assert.equal(notifications, 1, "Reloads must replace upstream QuickCSS watchers");
    }
    console.log("Offline hidden reload/foreground checks passed",JSON.stringify({idleMs,withRuntime,samples}));
} finally {
    clearTimeout(deadline);
    await app.close();
    await rm(root,{recursive:true,force:true});
}
