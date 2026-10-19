import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// No inspector or browser automation connection: exercise the shipped executable's quit path.
const require = createRequire(import.meta.url);
const profile = await mkdtemp(join(tmpdir(), "excord-quit-"));
const plugin = join(profile, "plugins/quit-probe");
const marker = join(profile, "quit.json");
await mkdir(plugin, { recursive: true });
await writeFile(join(plugin, "index.ts"), `import definePlugin, { StartAt } from "@utils/types";
export default definePlugin({ name: "ExcordQuitProbe", description: "Checks normal shutdown", authors: [{ name: "Excord", id: 0n }],
enabledByDefault: true, startAt: StartAt.DOMContentLoaded,
start() {
    VencordNative.pluginHelpers.ExcordQuitProbe.step().then(count => {
        if (count < ${process.argv.includes("--refresh") ? 5 : 1}) setTimeout(() => ExcordNative.refresh(), 500);
        else VencordNative.pluginHelpers.ExcordQuitProbe.quit();
    });
} });`);
await writeFile(join(plugin, "native.ts"), `import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
const events: string[] = [];
export function step() {
    const path = ${JSON.stringify(marker + ".count")};
    let count = 0;
    try { count = Number(readFileSync(path, "utf8")); } catch {}
    writeFileSync(path, String(++count));
    return count;
}
export function quit() {
    for (const event of ["before-quit", "will-quit", "quit"])
        app.on(event, () => { events.push(event); writeFileSync(${JSON.stringify(marker)}, JSON.stringify(events)); });
    setTimeout(() => app.quit(), 250);
}`);
const packaged = process.argv.includes("--packaged");
const archive = process.argv.includes("--archive");
const archivePath = resolve(process.platform === "win32" ? "dist/win-unpacked/resources/app.asar"
    : process.platform === "darwin" ? "dist/mac-arm64/Excord.app/Contents/Resources/app.asar" : "dist/linux-unpacked/resources/app.asar");
const executable = packaged && !archive ? resolve(process.platform === "win32" ? "dist/win-unpacked/excord.exe"
    : process.platform === "darwin" ? "dist/mac-arm64/Excord.app/Contents/MacOS/excord" : "dist/linux-unpacked/excord") : require("electron");
const args = [...(process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : []), ...(archive ? [archivePath] : !packaged ? [resolve(".")] : [])];
const env = { ...process.env, EXCORD_USER_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, args, { env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", data => { output = (output + data).slice(-16000); });
child.stderr.on("data", data => { output = (output + data).slice(-16000); });
let forced = false;
const timeout = setTimeout(() => { forced = true; child.kill(); }, 60000);
try {
    const result = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    console.log(JSON.stringify({ packaged, ...result, forced, output }, null, 2));
    console.log("[quit-smoke] Page loads", await readFile(marker + ".count", "utf8").catch(() => "none"));
    assert.equal(forced, false, "The app must quit within a minute without an inspector attached");
    assert.equal(result.code, 0);
    const events: string[] = JSON.parse(await readFile(marker, "utf8"));
    assert.ok(events.includes("will-quit") && events.includes("quit"), JSON.stringify(events));
    console.log("[quit-smoke] Normal executable shutdown passed", events);
} finally {
    clearTimeout(timeout);
    child.stdout.destroy();
    child.stderr.destroy();
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
