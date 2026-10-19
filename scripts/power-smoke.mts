import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { _electron } from "playwright-core";
import { useNativeVisibility } from "./utils/nativeVisibility.mts";

const require = createRequire(import.meta.url);
const root = await mkdtemp(join(tmpdir(), "excord-power-"));
const environment = { ...process.env, EXCORD_USER_DATA_DIR: root };
delete environment.ELECTRON_RUN_AS_NODE;
const target = process.argv.includes("--packaged")
  ? resolve(
      process.platform === "darwin"
        ? "dist/mac-arm64/Excord.app/Contents/Resources/app.asar"
        : process.platform === "win32"
          ? "dist/win-unpacked/resources/app.asar"
          : "dist/linux-unpacked/resources/app.asar",
    )
  : ".";
const application = await _electron.launch({
  executablePath: require("electron"),
  env: environment,
  args: [
    ...(process.platform === "linux"
      ? [
          "--no-sandbox",
          "--disable-gpu",
          ...(process.argv.includes("--headless")
            ? ["--ozone-platform=headless"]
            : []),
        ]
      : []),
    `--user-data-dir=${join(root, "chromium")}`,
    target,
  ],
  timeout: 30000,
});
const deadline = setTimeout(() => {
  application.process().kill();
  console.error("Power check timed out");
  process.exit(1);
}, 90000);
deadline.unref();
async function throttling(expected: boolean) {
  let actual: boolean | undefined;
  for (let i = 0; i < 50; i++) {
    actual = await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getBackgroundThrottling(),
    );
    if (actual === expected) return;
    await delay(100);
  }
  assert.equal(actual, expected, "Unexpected native background policy");
}
try {
  const page = await application.firstWindow();
  await page.waitForFunction(
    () => typeof Vencord !== "undefined" && document.readyState === "complete",
    undefined,
    { timeout: 30000 },
  );
  await useNativeVisibility(page);
  await throttling(true);
  await page.evaluate(() =>
    history.replaceState(history.state, "", location.href),
  );
  await throttling(true);
  await page.evaluate(
    await readFile(
      new URL("./fixtures/performance-workload.js", import.meta.url),
      "utf8",
    ),
  );
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].hide(),
  );
  await delay(300);
  assert.equal(await page.evaluate(() => document.hidden), true);
  const initiallyPaused = await page.evaluate(
    () => (globalThis as any).__excordWorkload.frames as number,
  );
  await delay(1000);
  assert.ok(
    (await page.evaluate(
      () => (globalThis as any).__excordWorkload.frames as number,
    )) -
      initiallyPaused <=
      1,
  );
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].show(),
  );
  await page.evaluate(
    await readFile(
      new URL("./fixtures/realtime-workload.js", import.meta.url),
      "utf8",
    ),
  );
  await throttling(false);
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].hide(),
  );
  const echoed = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const channel = (globalThis as any)
          .__excordTestChannel as RTCDataChannel;
        const timeout = setTimeout(
          () => reject(Error("Hidden WebRTC message timed out")),
          5000,
        );
        channel.onmessage = (event) => {
          clearTimeout(timeout);
          resolve(event.data);
        };
        channel.send("excord-hidden-realtime-probe");
      }),
  );
  assert.equal(echoed, "excord-hidden-realtime-probe");
  const frames = await page.evaluate(
    () => (globalThis as any).__excordWorkload.frames as number,
  );
  await delay(1000);
  assert.ok(
    (await page.evaluate(
      () => (globalThis as any).__excordWorkload.frames as number,
    )) > frames,
    "Active RTC must keep rendering at full speed",
  );
  await page.evaluate(() =>
    (globalThis as any).__excordTestPeers.forEach((peer: RTCPeerConnection) =>
      peer.close(),
    ),
  );
  // Electron's visibility transition is deferred until the window is shown.
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].show(),
  );
  await throttling(true);
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].hide(),
  );
  await delay(300);
  assert.equal(await page.evaluate(() => document.hidden), true);
  const paused = await page.evaluate(
    () => (globalThis as any).__excordWorkload.frames as number,
  );
  await delay(1000);
  assert.ok(
    (await page.evaluate(
      () => (globalThis as any).__excordWorkload.frames as number,
    )) -
      paused <=
      1,
    "Hidden idle animation must pause",
  );
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].show(),
  );
  await page.waitForFunction(
    (before) => (globalThis as any).__excordWorkload.frames > before,
    paused,
  );
  await page.evaluate(() => {
    VesktopNative.settings.set(
      { ...VesktopNative.settings.get(), backgroundEfficiency: false },
      "backgroundEfficiency",
    );
  });
  await throttling(false);
  await page.evaluate(() => {
    VesktopNative.settings.set(
      { ...VesktopNative.settings.get(), backgroundEfficiency: true },
      "backgroundEfficiency",
    );
  });
  await throttling(true);
  await page.route("https://discord.com/__excord_frame_probe", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><body>Frame probe</body>",
    }),
  );
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = "https://discord.com/__excord_frame_probe";
    document.body.append(frame);
  });
  await page
    .frameLocator('iframe[src$="__excord_frame_probe"]')
    .getByText("Frame probe")
    .waitFor();
  const frame = page
    .frames()
    .find((frame) => frame.url().endsWith("/__excord_frame_probe"))!;
  assert.deepEqual(
    await frame.evaluate(() => ({
      native: typeof ExcordNative,
      runtime: typeof Vencord,
      desktop: typeof VesktopNative,
    })),
    { native: "undefined", runtime: "undefined", desktop: "undefined" },
  );
  const report = {
    idleThrottling: true,
    connectedRtcProtected: true,
    hiddenRtcEcho: true,
    hiddenAnimationPaused: true,
    foregroundAnimationResumed: true,
    settingAppliesImmediately: true,
    subframeHasNoNativeBridge: true,
  };
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/power-smoke.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Power and real-time protection checks passed", report);
} catch (error) {
  const page = application.windows()[0];
  console.error(
    "[power] Native state",
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((win) => ({
        visible: win.isVisible(),
        background: win.webContents.getBackgroundThrottling(),
        preference:
          win.webContents.getLastWebPreferences().backgroundThrottling,
      })),
    ),
  );
  if (page) {
    const session = await page.context().newCDPSession(page);
    const prototype = await session.send("Runtime.evaluate", {
      expression: "RTCPeerConnection.prototype",
    });
    const objects = await session.send("Runtime.queryObjects", {
      prototypeObjectId: prototype.result.objectId!,
    });
    const states = await session.send("Runtime.callFunctionOn", {
      objectId: objects.objects.objectId!,
      functionDeclaration:
        "function(){return this.map(p=>({state:p.connectionState,ice:p.iceConnectionState,signaling:p.signalingState}));}",
      returnByValue: true,
    });
    console.error("[power] Peer states", states.result.value);
  }
  throw error;
} finally {
  const marker = join(root, "quit");
  await application
    .evaluate(({ app }, marker) => {
      app.once("quit", () =>
        process.getBuiltinModule("fs").writeFileSync(marker, "quit"),
      );
    }, marker)
    .catch(() => {});
  const child = application.process();
  const exited =
    child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolve) => child.once("exit", () => resolve()));
  let forced = false;
  const timeout = setTimeout(() => {
    let quit = false;
    try {
      quit = readFileSync(marker, "utf8") === "quit";
    } catch {}
    forced = !(process.platform === "win32" && quit);
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
    clearTimeout(deadline);
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
  assert.equal(forced, false, "The app did not record a normal quit event");
}
