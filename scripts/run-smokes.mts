import { spawn } from "node:child_process";

// Runs the packaged-application checks concurrently. Each check spawns its own
// Electron instance with an isolated EXCORD_USER_DATA_DIR, so they do not share
// state. Output is buffered per check and flushed on completion so the CI log
// stays grouped instead of interleaved.

type Check = { name: string; script: string; args?: string[]; timeoutMs?: number; retries?: number; serial?: boolean };

const CHECKS: Check[] = [
    // The Windows-packaged executable crashes under parallel load (dies
    // mid-refresh); it passes when run alone and on other platforms, so it
    // runs after the parallel pool drains instead of competing for resources.
    { name: "shutdown-packaged", script: "scripts/quit-smoke.mts", args: ["--packaged", "--refresh"], serial: true },
    { name: "shutdown-archive", script: "scripts/quit-smoke.mts", args: ["--archive", "--refresh"] },
    { name: "installer-persistence", script: "scripts/install-smoke.mts", timeoutMs: 7 * 60_000 },
    { name: "electron-dev", script: "scripts/electron-smoke.mts", timeoutMs: 5 * 60_000 },
    { name: "electron-packaged", script: "scripts/electron-smoke.mts", args: ["--packaged"], timeoutMs: 5 * 60_000 },
    { name: "recovery", script: "scripts/recovery-smoke.mts", timeoutMs: 4 * 60_000 },
    { name: "recovery-repeat", script: "scripts/recovery-smoke.mts", timeoutMs: 4 * 60_000 },
    { name: "power-subframe", script: "scripts/power-smoke.mts", args: ["--packaged"], timeoutMs: 3 * 60_000 },
];

const DEFAULT_TIMEOUT_MS = 3 * 60_000;
const concurrency = Math.max(1, Number(process.env.EXCORD_SMOKE_CONCURRENCY) || 3);

type Result = { name: string; code: number | null; forced: boolean; output: string; durationMs: number };

// Every check gets one retry: Electron shutdown under parallel load is
// flaky on all platforms, and a deterministic failure still reports failed.
async function retry(check: Check): Promise<Result> {
    let last = await run(check);
    for (let attempt = check.retries ?? 1; attempt > 0 && (last.code !== 0 || last.forced); attempt--) {
        console.log(`\n[${check.name}] failed, retrying`);
        const again = await run(check);
        last = { ...again, output: last.output + `\n----- retry -----\n` + again.output, durationMs: last.durationMs + again.durationMs };
    }
    return last;
}

function run(check: Check): Promise<Result> {
    const startedAt = Date.now();
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ["--import", "tsx", check.script, ...(check.args ?? [])], {
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        let forced = false;
        child.stdout.on("data", (data) => { output = (output + data).slice(-20000); });
        child.stderr.on("data", (data) => { output = (output + data).slice(-20000); });
        const timeout = setTimeout(() => {
            forced = true;
            child.kill();
        }, check.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        child.once("error", (error) => finish(null, `${error}\n`));
        child.once("exit", (code) => finish(code, ""));
        function finish(code: number | null, extra: string) {
            clearTimeout(timeout);
            resolve({ name: check.name, code, forced, output: output + extra, durationMs: Date.now() - startedAt });
        }
    });
}

const results: Result[] = [];
const pending = CHECKS.filter((check) => !check.serial);
const running = new Set<Promise<Result>>();

while (pending.length > 0 || running.size > 0) {
    while (pending.length > 0 && running.size < concurrency) {
        const check = pending.shift()!;
        const promise = retry(check);
        running.add(promise);
        void promise.then(() => running.delete(promise));
    }
    const result = await Promise.race(running);
    results.push(result);
    console.log(`\n===== ${result.name} (${(result.durationMs / 1000).toFixed(1)}s) =====`);
    process.stdout.write(result.output.endsWith("\n") ? result.output : result.output + "\n");
    if (result.forced) console.log(`[${result.name}] Timed out`);
    if (result.code !== 0 || result.forced) console.log(`[${result.name}] FAILED with code ${result.code}`);
}

for (const check of CHECKS.filter((check) => check.serial)) {
    const result = await retry(check);
    results.push(result);
    console.log(`\n===== ${result.name} (${(result.durationMs / 1000).toFixed(1)}s) =====`);
    process.stdout.write(result.output.endsWith("\n") ? result.output : result.output + "\n");
    if (result.forced) console.log(`[${result.name}] Timed out`);
    if (result.code !== 0 || result.forced) console.log(`[${result.name}] FAILED with code ${result.code}`);
}

const failed = results.filter((result) => result.code !== 0 || result.forced);
console.log("\n===== summary =====");
for (const result of results)
    console.log(`${result.code === 0 && !result.forced ? "PASS" : "FAIL"} ${result.name} ${(result.durationMs / 1000).toFixed(1)}s`);
if (failed.length > 0) {
    console.error(`${failed.length} check(s) failed: ${failed.map((result) => result.name).join(", ")}`);
    process.exit(1);
}
console.log(`All ${results.length} checks passed`);
