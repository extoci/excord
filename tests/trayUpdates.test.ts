import { expect, test } from "bun:test";
import { createTrayUpdater, type TrayUpdateDialog } from "../src/excord/trayUpdates";
import { UpdateController, type UpdateDriver } from "../src/excord/updates";

function harness(supported = true) {
    const calls = { checks: 0, downloads: 0, installs: [] as boolean[], releases: 0 };
    const dialogs: TrayUpdateDialog[] = [];
    const answers: number[] = [];
    const driver: UpdateDriver = {
        async check() { calls.checks++; return { version: "2.0.0" }; },
        async download() { calls.downloads++; },
        cancel() {},
        install(relaunch) { calls.installs.push(relaunch); }
    };
    const controller = new UpdateController(driver, "1.0.0", supported, () => {});
    const run = createTrayUpdater(controller, async options => {
        dialogs.push(options);
        return answers.shift() ?? options.buttons.length - 1;
    }, async () => { calls.releases++; });
    return { calls, dialogs, answers, driver, controller, run };
}

test("tray can check, download and explicitly restart without a renderer", async () => {
    const h = harness();
    h.answers.push(0, 0);
    await h.run();
    expect(h.calls).toEqual({ checks: 1, downloads: 1, installs: [true], releases: 0 });
    expect(h.dialogs.map(d => d.buttons[0])).toEqual(["Download update", "Restart and update"]);
});

test("cancelling download or deferring restart never installs on quit", async () => {
    const cancelled = harness();
    await cancelled.run();
    expect(cancelled.calls.downloads).toBe(0);
    const later = harness();
    later.answers.push(0, 1);
    await later.run();
    expect(later.controller.snapshot().phase).toBe("ready");
    expect(later.controller.install(false)).toBe(false);
    expect(later.calls.installs).toEqual([]);
    later.answers.push(0);
    await later.run();
    expect(later.calls.checks).toBe(1);
    expect(later.calls.downloads).toBe(1);
    expect(later.calls.installs).toEqual([true]);
});

test("automatic download joins the tray check and still requires restart consent", async () => {
    const h = harness();
    h.controller.setAutomaticDownloads(true);
    await h.run();
    expect(h.calls.downloads).toBe(1);
    expect(h.dialogs.map(d => d.buttons[0])).toEqual(["Restart and update"]);
    expect(h.calls.installs).toEqual([]);
});

test("concurrent tray clicks coalesce, then allow a fresh attempt", async () => {
    const h = harness();
    await Promise.all([h.run(), h.run(), h.run()]);
    expect(h.calls.checks).toBe(1);
    expect(h.dialogs).toHaveLength(1);
    await h.run();
    expect(h.calls.checks).toBe(2);
});

test("unsupported builds offer installers without checking", async () => {
    const h = harness(false);
    h.answers.push(0);
    await h.run();
    expect(h.calls.checks).toBe(0);
    expect(h.calls.releases).toBe(1);
});

test("check and download failures show native recovery and remain retryable", async () => {
    for (const operation of ["check", "download"] as const) {
        const h = harness();
        h.driver[operation] = async () => { throw Error("Offline"); };
        if (operation === "download") h.answers.push(0);
        h.answers.push(0);
        await h.run();
        expect(h.dialogs.at(-1)?.message).toBe("Excord update needs attention");
        expect(h.calls.releases).toBe(1);
        expect(h.calls.installs).toEqual([]);
    }
});

test("a background download reports progress without starting a second download", async () => {
    const h = harness();
    let finish!: () => void;
    h.driver.download = () => new Promise<void>(resolve => { finish = resolve; });
    await h.controller.check();
    const downloading = h.controller.action("download");
    await Promise.resolve();
    h.controller.progress(42);
    await h.run();
    expect(h.dialogs[0].detail).toContain("42%");
    expect(h.calls.checks).toBe(1);
    finish();
    await downloading;
});

test("up to date checks and signing rejection have distinct native feedback", async () => {
    const current = harness();
    current.driver.check = async () => undefined;
    await current.run();
    expect(current.dialogs[0].message).toBe("Excord is up to date");
    const manual = harness();
    manual.driver.download = async () => { throw { domain: "SQRLCodeSignatureErrorDomain" }; };
    manual.answers.push(0, 0);
    await manual.run();
    expect(manual.dialogs.at(-1)?.detail).toContain("signing identity");
    expect(manual.calls.releases).toBe(1);
    expect(manual.calls.installs).toEqual([]);
});

test("a download cancelled from Settings is not reported as up to date", async () => {
    const h = harness();
    h.driver.download = async () => { await h.controller.action("cancel"); };
    h.answers.push(0);
    await h.run();
    expect(h.dialogs.at(-1)?.message).toBe("Excord update is available");
    expect(h.calls.installs).toEqual([]);
});
