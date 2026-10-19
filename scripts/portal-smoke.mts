import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { _electron } from "playwright-core";
import { PORTAL_BANNER_HEIGHT } from "../src/excord/developerPortal";

// Disposable native harness. All HTTPS is intercepted; no real Discord account/network.
const root = await mkdtemp(join(tmpdir(), "excord-portal-smoke-"));
await build({ entryPoints: ["tests/fixtures/portal-native-main.mts"], outfile: join(root, "main.cjs"), bundle: true, platform: "node", format: "cjs", external: ["electron"] });
await build({ entryPoints: ["tests/fixtures/portal-native-preload.ts"], outfile: join(root, "preload.cjs"), bundle: true, platform: "node", format: "cjs", external: ["electron"] });
// Minimal test controls only. The visual portal/settings mock is deliberately absent.
const hostHtml = join(root, "host.html");
await writeFile(hostHtml, `<!doctype html><meta charset="utf-8"><title>Portal lifecycle test</title>
<button id="open">Developer Portal</button><button id="back" hidden>Back to Excord</button>
<script>
const open = document.getElementById("open"), back = document.getElementById("back");
open.onclick = () => ExcordNative.openDeveloperPortal();
back.onclick = () => ExcordNative.closeDeveloperPortal();
ExcordNative.onDeveloperPortalState(state => {
    open.hidden = state.open; back.hidden = !state.open;
    document.documentElement.dataset.portalFailed = String(state.failed);
});
</script>`);
const env = { ...process.env, EXCORD_PORTAL_TEST_PROFILE: join(root, "profile"), EXCORD_PORTAL_TEST_PRELOAD: join(root, "preload.cjs"), EXCORD_PORTAL_TEST_HTML: hostHtml };
delete env.ELECTRON_RUN_AS_NODE;
const application = await _electron.launch({ executablePath: createRequire(import.meta.url)("electron"), env,
    args: [...(process.platform === "linux" ? ["--no-sandbox", "--disable-gpu", "--ozone-platform=headless"] : []), join(root, "main.cjs")], timeout: 30000 });
const child = application.process();
child.stdout?.on("data", data => process.stdout.write(String(data)));
child.stderr?.on("data", data => process.stderr.write(String(data)));
application.on("console", message => console.log("[main]", message.text()));
async function wait(check: () => Promise<boolean>) {
    const end = Date.now() + 15000;
    while (!await check()) { assert.ok(Date.now() < end, "Timed out waiting for portal state"); await delay(100); }
}
let page: Awaited<ReturnType<typeof application.firstWindow>>;
const call = (command: string, value?: unknown) => page.evaluate(([command, value]) => (globalThis as any).PortalTest.call(command, value), [command, value]);
const view = () => call("snapshot") as Promise<{ id: number; bounds: { x: number; y: number; width: number; height: number; }; url: string; loading: boolean; sameSession: boolean; } | null>;
try {
    page = await application.firstWindow();
    await page.getByRole("button", { name: "Developer Portal", exact: true }).waitFor();
    const mainId = await call("mainId");
    await page.evaluate(() => { (globalThis as any).__chatPreserved = "same renderer"; });
    await page.getByRole("button", { name: "Developer Portal", exact: true }).evaluate(button => button.click());
    await wait(async () => { const current = await view(); return !!current && !current.loading && current.url.startsWith("https://discord.com/developers/"); });
    console.log("[portal] View opened");
    const first = (await view())!;
    assert.equal(first.sameSession, true);
    assert.equal(first.bounds.y, PORTAL_BANNER_HEIGHT);
    const isolation = await call("isolation");
    assert.deepEqual(isolation, { bridge: "undefined", mod: "undefined", desktop: "undefined", node: "undefined", opener: true });
    await page.evaluate(() => ExcordNative.openDeveloperPortal());
    assert.equal((await view())!.id, first.id, "Opening twice must reuse the view");
    await call("resize");
    await wait(async () => (await view())!.bounds.width === 1000);
    assert.equal((await view())!.bounds.height, 700 - PORTAL_BANNER_HEIGHT);
    await call("zoom");
    assert.equal((await view())!.bounds.y, Math.round(PORTAL_BANNER_HEIGHT * 1.25), "Native bounds must account for the banner's zoom");
    await call("unsaved");
    await page.getByRole("button", { name: "Back to Excord" }).evaluate(button => button.click());
    await delay(200);
    assert.equal((await view())!.id, first.id, "Canceling an unsaved-changes prompt must keep the view");
    await call("discard");
    await page.getByRole("button", { name: "Back to Excord" }).evaluate(button => button.click());
    await wait(async () => await view() === null);
    await wait(() => call("destroyed", first.id));
    assert.equal(await page.evaluate(() => (globalThis as any).__chatPreserved), "same renderer");
    assert.equal(await call("mainId"), mainId);
    console.log("[portal] Back preserved the main renderer and destroyed the view");
    await call("fail", true);
    await page.getByRole("button", { name: "Developer Portal", exact: true }).evaluate(button => button.click());
    await page.waitForFunction(() => document.documentElement.dataset.portalFailed === "true");
    await call("fail", false);
    await page.evaluate(() => ExcordNative.reloadDeveloperPortal());
    await wait(async () => !(await view())!.loading && (await view())!.url.startsWith("https://discord.com/developers/"));
    await page.getByRole("button", { name: "Back to Excord" }).evaluate(button => button.click());
    await page.getByRole("button", { name: "Developer Portal", exact: true }).waitFor();
    await page.getByRole("button", { name: "Developer Portal", exact: true }).evaluate(button => button.click());
    await wait(async () => !!await view());
    await page.reload();
    await wait(async () => await view() === null);
    const report = { mockOnly: true, noNetwork: true, sharedSession: true, noPortalBridgeOrNode: true, duplicateOpenReusesView: true, resizeAndZoom: true, backPreservesChatRenderer: true, closedViewDestroyed: true, offlineRetry: true, mainReloadClosesPortal: true, unsavedChangesCanCancel: true };
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/portal-smoke.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
} finally {
    const timeout = setTimeout(() => child.kill(), 10000);
    try { await application.close(); } finally { clearTimeout(timeout); await rm(root, { recursive: true, force: true }); }
}
