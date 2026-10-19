import { expect, test } from "bun:test";
import { UpdateController, UPDATE_CHECK_INTERVAL, type UpdateDriver } from "../src/excord/updates";
import { resolveUpdateFeed, updateCandidates, UPDATE_METADATA } from "../src/excord/updateFeed";
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness(supported = true, lastCheckedAt?: number) {
    const calls = { checks: 0, downloads: 0, cancelled: 0, installs: [] as boolean[] };
    const pending = deferred();
    const driver: UpdateDriver = {
        async check() { calls.checks++; return { version: "0.0.1-alpha.1", notes: "Changes" }; },
        download() { calls.downloads++; return pending.promise; },
        cancel() { calls.cancelled++; if (calls.downloads) pending.reject(Error("Cancelled")); },
        install(relaunch) { calls.installs.push(relaunch); }
    };
    const controller = new UpdateController(driver, "0.0.0-alpha1", supported, () => {}, lastCheckedAt, () => {}, () => UPDATE_CHECK_INTERVAL * 2);
    return { calls, pending, driver, controller };
}
test("construction and unsupported builds never check or download", async () => {
    const normal = harness(); expect(normal.calls.checks).toBe(0);
    const { controller, calls } = harness(false); await controller.action("check"); await controller.action("download");
    expect(calls.checks).toBe(0); expect(calls.downloads).toBe(0); expect(controller.snapshot().phase).toBe("unsupported");
});
test("automatic checks respect one day, manual checks bypass it and concurrent checks coalesce", async () => {
    const { controller, calls } = harness(true, UPDATE_CHECK_INTERVAL * 2 - 1);
    await controller.check(true); expect(calls.checks).toBe(0);
    await Promise.all([controller.action("check"), controller.action("check")]);
    expect(calls.checks).toBe(1); expect(controller.snapshot().phase).toBe("available");
    expect(calls.downloads).toBe(0); expect(calls.installs).toEqual([]);
});
test("download completion requires separate install consent; quit install does not reopen", async () => {
    const { controller, calls, pending } = harness();
    expect(controller.install(true)).toBe(false); await controller.action("check");
    const downloading = controller.action("download"); await Promise.resolve(); await Promise.resolve();
    controller.progress(142); expect(controller.snapshot().progress).toBe(100);
    pending.resolve(); await downloading;
    expect(controller.snapshot().phase).toBe("ready"); expect(calls.installs).toEqual([]);
    expect(controller.install(false)).toBe(false);
    await controller.action("install-on-quit"); await controller.action("keep-current"); expect(controller.install(false)).toBe(false);
    await controller.action("install-on-quit"); expect(controller.install(false)).toBe(true);
    expect(calls.installs).toEqual([false]); expect(controller.install(true)).toBe(false);
});
test("explicit restart reopens and installation errors disarm consent", async () => {
    const { controller, pending, calls } = harness(); await controller.action("check");
    pending.resolve(); await controller.action("download"); await controller.action("restart");
    expect(calls.installs).toEqual([true]); controller.installFailed();
    expect(controller.snapshot().phase).toBe("ready"); expect(controller.snapshot().installOnQuit).toBe(false);
    expect(controller.snapshot().error).toContain("Couldn’t install");
});
test("cancelling an active download preserves the app and permits retry", async () => {
    const { controller, calls } = harness(); await controller.action("check");
    const operation = controller.action("download"); await Promise.resolve(); await Promise.resolve();
    await controller.action("cancel"); await operation;
    expect(calls.cancelled).toBe(1); expect(calls.installs).toEqual([]); expect(controller.snapshot().phase).toBe("available");
    expect(controller.snapshot().error).toBeUndefined();
});
test("cancelling before the download starts does not start a network request", async () => {
    const { controller, calls } = harness(); await controller.action("check");
    const operation = controller.action("download"); await controller.action("cancel"); await operation;
    expect(calls.downloads).toBe(0); expect(controller.snapshot().phase).toBe("available");
});
test("failed check and download remain retryable without automatically installing", async () => {
    const { controller, calls, driver, pending } = harness();
    driver.check = async () => { throw Error("Offline"); }; await controller.check();
    expect(controller.snapshot().phase).toBe("idle"); expect(controller.snapshot().error).toBeDefined();
    driver.check = async () => ({ version: "0.0.1-alpha.1" }); await controller.check();
    pending.reject(Error("Offline")); await controller.action("download");
    expect(controller.snapshot().phase).toBe("available"); expect(calls.installs).toEqual([]);
});
test("release discovery excludes drafts and releases without update metadata", () => {
    const asset = [{ name: UPDATE_METADATA }, { name: "latest-mac.yml" }];
    expect(updateCandidates([{ draft: false, tag_name: "v0.1.1-alpha.3", assets: [] }, { draft: true, tag_name: "v0.0.1-alpha.1", assets: asset }, { draft: false, tag_name: "v0.0.0-alpha1", assets: asset }]).map(r => r.tag_name)).toEqual(["v0.0.0-alpha1"]);
});
test("feed resolver uses the immutable published release directory", async () => {
    const release = [{ draft: false, tag_name: "v0.0.0-alpha1", assets: [{ name: UPDATE_METADATA }, { name: "latest-mac.yml" }] }];
    const request = (async () => Response.json(release)) as typeof fetch;
    expect(await resolveUpdateFeed(request)).toBe("https://github.com/extoci/excord/releases/download/v0.0.0-alpha1/");
    await expect(resolveUpdateFeed((async () => Response.json([])) as typeof fetch)).rejects.toThrow("No update release");
});
