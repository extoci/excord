import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { _electron, type ElectronApplication } from "playwright-core";

const require = createRequire(import.meta.url);
const archive = resolve(
  process.platform === "darwin"
    ? "dist/mac-arm64/Excord.app/Contents/Resources/app.asar"
    : process.platform === "win32"
      ? "dist/win-unpacked/resources/app.asar"
      : "dist/linux-unpacked/resources/app.asar",
);
const profile = await mkdtemp(join(tmpdir(), "excord alpha recovery "));
const probe = join(profile, "plugins/recovery-probe");
await mkdir(probe, { recursive: true });
await writeFile(
  join(probe, "index.ts"),
  `import definePlugin, {StartAt} from "@utils/types";
export default definePlugin({name:"ExcordAlphaRecoveryProbe",description:"Alpha recovery check",authors:[],enabledByDefault:true,startAt:StartAt.DOMContentLoaded,start(){globalThis.__excordAlphaProbe=true;}});`,
);
await writeFile(
  join(probe, "native.ts"),
  `import {writeFileSync} from "node:fs";writeFileSync(${JSON.stringify(join(profile, "native-ran"))},"loaded");export function echo(){return true;}`,
);
await writeFile(join(profile, "settings.json"), '{"unfinished":');
await writeFile(
  join(profile, "state.json"),
  JSON.stringify({
    windowBounds: { width: -1, height: 0 },
    launchArguments: { invalid: true },
  }),
);
const environment = Object.fromEntries(
  Object.entries({ ...process.env, EXCORD_USER_DATA_DIR: profile }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
delete environment.ELECTRON_RUN_AS_NODE;
const results: Record<string, unknown> = {};
let current: ElectronApplication | undefined;
let startupOutput = "";
const deadline = setTimeout(() => {
  current?.process().kill();
  console.error("Recovery test deadline exceeded");
  process.exit(1);
}, 180000);
deadline.unref();

async function close(application: ElectronApplication, name: string) {
  const child = application.process();
  let processExited = child.exitCode !== null || child.signalCode !== null;
  const exited = processExited
    ? Promise.resolve()
    : new Promise<void>((resolve) =>
        child.once("exit", () => {
          processExited = true;
          resolve();
        }),
      );
  const marker = join(profile, `quit-${name}`);
  await application.evaluate(({ app }, marker) => {
    app.once("quit", () =>
      process.getBuiltinModule("fs").writeFileSync(marker, "quit"),
    );
  }, marker);
  let forced = false;
  let exitTimeout: ReturnType<typeof setTimeout> | undefined;
  let finishTimeout: () => void = () => {};
  const timedOut = new Promise<void>((resolve) => {
    finishTimeout = resolve;
  });
  const timeout = setTimeout(() => {
    const quit = existsSync(marker) && readFileSync(marker, "utf8") === "quit";
    forced = !(process.platform === "win32" && quit);
    try {
      if (process.platform === "win32")
        execFileSync(
          "taskkill",
          ["/PID", String(application.process().pid), "/T", "/F"],
          { stdio: "ignore" },
        );
      else application.process().kill();
    } catch {}
    // taskkill returning is not proof the process has released the profile lock.
    exitTimeout = setTimeout(() => {
      forced = true;
      finishTimeout();
    }, 5000);
    void exited.then(finishTimeout);
  }, 10000);
  try {
    await Promise.race([Promise.all([application.close(), exited]), timedOut]);
  } finally {
    clearTimeout(timeout);
    clearTimeout(exitTimeout);
    current = undefined;
  }
  assert.ok(
    !forced,
    "Shutdown must reach quit; normal executable shutdown is checked independently",
  );
  assert.ok(existsSync(marker), "Missing quit marker");
  assert.ok(processExited, "The process must exit before reusing its profile");
  console.log(`[recovery] ${name} process exited before profile reuse`);
}
async function launch(safe: boolean) {
  startupOutput = "";
  current = await _electron.launch({
    executablePath: require("electron"),
    args: [
      ...(process.platform === "linux"
        ? ["--no-sandbox", "--disable-gpu"]
        : []),
      archive,
      ...(safe ? ["--safe-mode"] : []),
    ],
    env: environment,
    timeout: 30000,
  });
  for (const stream of [current.process().stdout, current.process().stderr])
    stream?.on("data", (data) => {
      startupOutput = (startupOutput + data).slice(-12000);
    });
  return current;
}
try {
  const safe = await launch(true);
  const safePage = await safe.firstWindow();
  await safePage.waitForURL(/https:\/\/(?:\w+\.)?discord\.com\//, {
    timeout: 30000,
  });
  await safePage.waitForLoadState("domcontentloaded");
  assert.equal(
    await safePage.evaluate(
      () => typeof (globalThis as Record<string, unknown>).Vencord,
    ),
    "undefined",
  );
  assert.equal(
    await safePage.evaluate(
      () => typeof (globalThis as Record<string, unknown>).ExcordNative,
    ),
    "undefined",
  );
  assert.equal(
    existsSync(join(profile, "native-ran")),
    false,
    "Safe mode must not load native plugins",
  );
  assert.ok(
    (await readdir(profile)).some((file) => file.endsWith(".bak")),
    "Malformed settings must be backed up",
  );
  await safe.evaluate(async ({ session, Menu, BrowserWindow }) => {
    if (!Menu.getApplicationMenu()?.getMenuItemById("excord-safe-mode"))
      throw Error("Missing recovery menu");
    if (
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
        .preload
    )
      throw Error("Safe mode must not use a modification preload");
    await session.defaultSession.cookies.set({
      url: "https://discord.com",
      name: "excord-alpha-persistence",
      value: "test-only",
      expirationDate: Date.now() / 1000 + 3600,
    });
    await session.defaultSession.cookies.flushStore();
  });
  await close(safe, "safe");
  results.safeMode = true;
  console.log("[recovery] Safe mode bypassed renderer and native plugins");
  const normal = await launch(false);
  const page = await normal.firstWindow();
  await page.waitForFunction(
    () => (globalThis as Record<string, unknown>).__excordAlphaProbe === true,
    undefined,
    { timeout: 30000 },
  );
  assert.ok(
    existsSync(join(profile, "native-ran")),
    "Native plugins must resume on a normal launch",
  );
  assert.equal(
    await normal.evaluate(
      async ({ session }) =>
        (
          await session.defaultSession.cookies.get({
            url: "https://discord.com",
            name: "excord-alpha-persistence",
          })
        )[0]?.value,
    ),
    "test-only",
  );
  results.profilePreserved = true;
  console.log(
    "[recovery] Normal launch restored plugins and preserved the session",
  );
  await page.route("https://discord.com/**", (route) =>
    route.abort("internetdisconnected"),
  );
  await normal.evaluate(({ Menu, BrowserWindow }) => {
    const item = Menu.getApplicationMenu()!.getMenuItemById(
      "excord-force-refresh",
    )!;
    item.click(item, BrowserWindow.getAllWindows()[0], {} as KeyboardEvent);
  });
  // The intentional network failure rejects a navigation waiter before recovery commits.
  const offlineDeadline = Date.now() + 30000;
  while (
    page.url() !== "excord://static/views/offline.html" &&
    Date.now() < offlineDeadline
  )
    await delay(100);
  assert.equal(page.url(), "excord://static/views/offline.html");
  await page.getByRole("heading", { name: "Discord couldn't load" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => typeof (globalThis as Record<string, unknown>).ExcordNative,
    ),
    "undefined",
  );
  assert.equal(
    await page.evaluate(
      () => typeof (globalThis as Record<string, unknown>).VesktopNative,
    ),
    "undefined",
  );
  await page.unroute("https://discord.com/**");
  await page.getByRole("link", { name: "try again" }).click();
  await page.waitForFunction(
    () => (globalThis as Record<string, unknown>).__excordAlphaProbe === true,
    undefined,
    { timeout: 30000 },
  );
  results.offlineRecovery = true;
  console.log(
    "[recovery] Offline page retried successfully without exposing native APIs",
  );
  const reportPath = join(profile, "diagnostics.json");
  await normal.evaluate(({ dialog, Menu }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    if (!Menu.getApplicationMenu()?.getMenuItemById("excord-export-diagnostics"))
      throw Error("Missing diagnostics export menu");
  }, reportPath);
  // File creation precedes write completion. Await the IPC operation before reading.
  assert.equal(await page.evaluate(() => ExcordNative.exportDiagnostics()), true);
  const report = await readFile(reportPath, "utf8");
  assert.equal(JSON.parse(report).schemaVersion, 1);
  assert.ok(
    !report.includes(profile) &&
      !report.includes("ExcordAlphaRecoveryProbe") &&
      !report.includes("test-only"),
  );
  results.diagnosticsPrivate = true;
  console.log("[recovery] Diagnostics export excluded private fields");
  await close(normal, "normal");
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/recovery-smoke.json",
    JSON.stringify(results, null, 2),
  );
  console.log("Alpha recovery checks passed", results);
} catch (error) {
  console.error("[recovery] Failure state", {
    processExitCode: current?.process().exitCode,
    processSignal: current?.process().signalCode,
    windows: current?.windows().length,
    startupOutput,
  });
  throw error;
} finally {
  clearTimeout(deadline);
  if (current) {
    const failed = current;
    await close(failed, "failed").catch(() => failed.process().kill());
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
