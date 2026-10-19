import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import { _electron, type ElectronApplication } from "playwright-core";
import { useNativeVisibility } from "./utils/nativeVisibility.mts";

const { values } = parseArgs({
  options: {
    app: { type: "string", default: "." },
    baseline: { type: "string" },
    output: { type: "string", default: "test-results/runtime-benchmark.json" },
    rounds: { type: "string", default: "5" },
    seconds: { type: "string", default: "5" },
    headless: { type: "boolean", default: false },
    profile: { type: "boolean", default: false },
    executable: { type: "string" },
    client: { type: "string", default: "excord" },
    packaged: { type: "boolean", default: false },
    settings: { type: "string" },
    corpus: { type: "string" },
  },
});
const rounds = Number(values.rounds);
const sampleMs = Number(values.seconds) * 1000;
assert.ok(Number.isInteger(rounds) && rounds > 0 && rounds <= 30);
assert.ok(sampleMs >= 1000 && sampleMs <= 60000);
const require = createRequire(import.meta.url);
const executablePath = values.executable
  ? resolve(values.executable)
  : (require("electron") as string);
const root = await mkdtemp(join(tmpdir(), "excord-perf-"));
const variants = [
  ...(values.baseline
    ? [{ label: "baseline", app: resolve(values.baseline) }]
    : []),
  {
    label: values.client === "excord" ? "candidate" : values.client!,
    app: values.packaged ? executablePath : resolve(values.app!),
  },
];
const results: Record<string, unknown>[] = [];
let current: ElectronApplication | undefined;
const deadline = setTimeout(
  () => {
    current?.process().kill();
    console.error("Benchmark exceeded its deadline");
    process.exit(1);
  },
  rounds * variants.length * (sampleMs * 5 + 90000),
);
deadline.unref();

async function metrics(application: ElectronApplication) {
  return application.evaluate(({ app }) =>
    app.getAppMetrics().map((p) => ({
      pid: p.pid,
      cpu: p.cpu.cumulativeCPUUsage,
      workingSetKiB: p.memory.workingSetSize,
    })),
  );
}
function cpu(
  before: Awaited<ReturnType<typeof metrics>>,
  after: Awaited<ReturnType<typeof metrics>>,
  milliseconds: number,
) {
  const previous = new Map(before.map((p) => [p.pid, p.cpu]));
  return (
    (after.reduce(
      (total, p) => total + Math.max(0, p.cpu - (previous.get(p.pid) ?? 0)),
      0,
    ) /
      (milliseconds / 1000)) *
    100
  );
}
async function close(application: ElectronApplication, profile: string) {
  const marker = join(profile, "quit");
  await application.evaluate(({ app }, marker) => {
    app.once("quit", () =>
      process.getBuiltinModule("fs").writeFileSync(marker, "quit"),
    );
  }, marker);
  const child = application.process();
  const exited =
    child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const timeout = setTimeout(() => {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } catch {}
    } else child.kill();
  }, 10000);
  try {
    await Promise.race([application.close(), exited]);
    await exited;
  } finally {
    clearTimeout(timeout);
    current = undefined;
  }
  assert.equal(await readFile(marker, "utf8"), "quit");
}
try {
  for (let round = 0; round < rounds; round++) {
    // Alternate order so the second build does not always get warmer OS caches.
    for (const variant of round % 2 ? [...variants].reverse() : variants) {
      const profile = join(root, `${variant.label}-${round}`);
      await mkdir(profile, { recursive: true });
      const environment = { ...process.env, EXCORD_USER_DATA_DIR: profile };
      if (process.platform === "linux")
        environment["XDG_CONFIG_HOME"] = join(profile, "xdg");
      if (values.client === "vesktop") {
        environment["VENCORD_USER_DATA_DIR"] = profile;
        await writeFile(
          join(profile, "state.json"),
          JSON.stringify({ firstLaunch: false }),
        );
      }
      if (values.client === "legcord") {
        assert.ok(
          values.settings,
          "Pass the pinned Legcord default settings with doneSetup=true",
        );
        for (const config of [
          join(profile, "chromium/storage"),
          join(profile, "xdg/legcord/storage"),
        ]) {
          await mkdir(config, { recursive: true });
          await writeFile(
            join(config, "settings.json"),
            await readFile(values.settings, "utf8"),
          );
        }
      }
      delete environment.ELECTRON_RUN_AS_NODE;
      const started = performance.now();
      const application = (current = await _electron.launch({
        executablePath,
        env: environment,
        args: [
          ...(process.platform === "linux"
            ? [
                "--no-sandbox",
                "--disable-gpu",
                ...(values.headless ? ["--ozone-platform=headless"] : []),
              ]
            : []),
          `--user-data-dir=${join(profile, "chromium")}`,
          ...(values.packaged ? [] : [variant.app]),
        ],
        timeout: 60000,
      }));
      let page = await application.firstWindow({ timeout: 60000 });
      const windowMs = performance.now() - started;
      const discordDeadline = Date.now() + 90000;
      while (
        !/^https:\/\/(?:\w+\.)?discord\.com\//.test(page.url()) &&
        Date.now() < discordDeadline
      ) {
        page =
          application
            .windows()
            .find((p) => /^https:\/\/(?:\w+\.)?discord\.com\//.test(p.url())) ??
          page;
        await delay(100);
      }
      const mainWindow = await application.browserWindow(page);
      const cdp = await page.context().newCDPSession(page);
      if (values.profile) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.start");
      }
      await page.waitForFunction(
        () => document.querySelector('input[name="email"]') !== null,
        undefined,
        { timeout: 60000 },
      );
      const loginMs = performance.now() - started;
      await delay(5000);
      // Do this after navigation: Playwright re-applies the override to new renderer targets.
      await useNativeVisibility(page);
      const idleBefore = await metrics(application);
      const idleStarted = performance.now();
      await delay(sampleMs);
      const idleAfter = await metrics(application);
      const idleCpuPercent = cpu(
        idleBefore,
        idleAfter,
        performance.now() - idleStarted,
      );
      const runtime = await page.evaluate(() => ({
        plugins:
          typeof Vencord === "undefined"
            ? 0
            : Object.keys(Vencord.Plugins.plugins).length,
        aliases:
          typeof ExcordModules === "undefined"
            ? 0
            : Object.keys(ExcordModules).length,
        enabled:
          typeof Vencord === "undefined"
            ? 0
            : Object.keys(Vencord.Plugins.plugins).filter((name) =>
                Vencord.Plugins.isPluginEnabled(name),
              ).length,
      }));
      if (values.client === "excord")
        assert.ok(
          runtime.plugins > 300,
          "Excord must load its catalog before measuring",
        );
      if (values.corpus && round === 0) {
        const corpus = await page.evaluate(() => ({
          buildNumber: Vencord.WebpackPatcher.getBuildNumber(),
          sources: Object.values(Vencord.Webpack.wreq.m).map(String),
          patches: Vencord.WebpackPatcher.patches.map((p) => ({
            find:
              typeof p.find === "string"
                ? p.find
                : { source: p.find.source, flags: p.find.flags },
          })),
          historicalFindStrings: (
            Vencord.WebpackPatcher as unknown as {
              getExcordPatchFindStrings?(): string[];
            }
          ).getExcordPatchFindStrings?.(),
        }));
        assert.ok(
          Array.isArray(corpus.patches) && corpus.patches.length > 0,
          "The runtime patch set was unavailable",
        );
        await writeFile(values.corpus, JSON.stringify(corpus));
      }
      // A deterministic UI workload, reported separately from actual Discord idle CPU.
      await page.evaluate(
        await readFile(
          new URL("./fixtures/performance-workload.js", import.meta.url),
          "utf8",
        ),
      );
      const sample = async () => {
        const countsBefore = await page.evaluate(() => {
          const s = (globalThis as any).__excordWorkload;
          return { frames: s.frames, ticks: s.ticks };
        });
        const before = await metrics(application);
        const start = performance.now();
        await delay(sampleMs);
        const after = await metrics(application);
        const milliseconds = performance.now() - start;
        const countsAfter = await page.evaluate(() => {
          const s = (globalThis as any).__excordWorkload;
          return { frames: s.frames, ticks: s.ticks, hidden: document.hidden };
        });
        return {
          milliseconds,
          cpuPercent: cpu(before, after, milliseconds),
          frames: countsAfter.frames - countsBefore.frames,
          ticks: countsAfter.ticks - countsBefore.ticks,
          hidden: countsAfter.hidden,
        };
      };
      const visible = await sample();
      await mainWindow.evaluate((win) => win.hide());
      await delay(300);
      const hidden = await sample();
      await mainWindow.evaluate((win) => win.show());
      await delay(300);
      const resumed = await sample();
      await page.evaluate(() => (globalThis as any).__excordWorkload.stop());
      if (values.profile) {
        const { profile: cpuProfile } = await cdp.send("Profiler.stop");
        await mkdir(dirname(resolve(values.output!)), { recursive: true });
        await writeFile(
          `${values.output}.${variant.label}-${round}.cpuprofile`,
          JSON.stringify(cpuProfile),
        );
      }
      const versions = await application.evaluate(({ app }) => ({
        version: app.getVersion(),
        electron: process.versions.electron,
        chromium: process.versions.chrome,
      }));
      const result = {
        label: variant.label,
        app: variant.app,
        round,
        versions,
        windowMs,
        loginMs,
        idleCpuPercent,
        workingSetMiB:
          idleAfter.reduce((sum, p) => sum + p.workingSetKiB, 0) / 1024,
        runtime,
        visible,
        hidden,
        resumed,
      };
      results.push(result);
      console.log(JSON.stringify(result));
      await close(application, profile);
    }
  }
  await mkdir(dirname(resolve(values.output!)), { recursive: true });
  await writeFile(
    values.output!,
    JSON.stringify(
      {
        schemaVersion: 1,
        environment: {
          platform: process.platform,
          architecture: process.arch,
          osRelease: release(),
          cpu: cpus()[0]?.model,
          headless: values.headless,
          softwareRendering: process.platform === "linux",
          instrumented: values.profile,
          freshProfilePerRun: true,
          client: values.client,
          executable: executablePath,
          settingsSha256: values.settings
            ? createHash("sha256")
                .update(await readFile(values.settings))
                .digest("hex")
            : undefined,
          sampleMs,
        },
        variants,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  clearTimeout(deadline);
  if (current)
    await close(current, root).catch(() => current?.process().kill());
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
}
