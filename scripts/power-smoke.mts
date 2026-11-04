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
let stage = "bootstrap";
try {
  const page = await application.firstWindow();
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("[power] Renderer:", message.text().slice(0, 800));
  });
  await page.waitForFunction(
    () => typeof Vencord !== "undefined" && document.readyState === "complete",
    undefined,
    { timeout: 30000 },
  );
  stage = "native visibility";
  await useNativeVisibility(page);
  await throttling(true);
  await page.evaluate(() =>
    history.replaceState(history.state, "", location.href),
  );
  await throttling(true);
  stage = "idle animation";
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
  stage = "real-time connection";
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
  stage = "hidden WebRTC echo";
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
  stage = "active WebRTC animation";
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
  stage = "return to idle";
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
  stage = "settings change";
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
  stage = "subframe isolation";
  // Test frame isolation on a mocked same-origin host. The live login page's
  // frame-src policy rejects synthetic frames before their preload can run.
  // Both responses are local; browser CSP enforcement and sandboxing stay on.
  let hostFulfilled = false;
  let probeFulfilled = false;
  await page.route("https://discord.com/__excord_isolation_host", (route) => {
    hostFulfilled = true;
    return route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Local isolation host</title><body>Local host</body>",
    });
  });
  await page.route("https://discord.com/__excord_frame_probe", (route) => {
    probeFulfilled = true;
    return route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><body>Frame probe</body>",
    });
  });
  await page.goto("https://discord.com/__excord_isolation_host");
  assert.equal(
    hostFulfilled,
    true,
    "The isolation host must use the local response",
  );
  assert.equal(
    await page.evaluate(() => typeof ExcordNative),
    "object",
    "The main frame must retain its native bridge",
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
  assert.equal(
    probeFulfilled,
    true,
    "The frame probe must use the local response",
  );
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
  console.error("[power] Failed stage:", stage, error);
  const page = application.windows()[0];
  console.error(
    "[power] Native state",
    await application
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((win) => ({
          visible: win.isVisible(),
          background: win.webContents.getBackgroundThrottling(),
          preference:
            win.webContents.getLastWebPreferences().backgroundThrottling,
        })),
      )
      .catch(String),
  );
  if (page) {
    // Inspect only peers created by this fixture. Heap-wide queryObjects can
    // crash Chromium and hide the original failure.
    console.error(
      "[power] Page state",
      await page
        .evaluate(() => ({
          url: location.href,
          hidden: document.hidden,
          runtime: typeof Vencord,
          native: typeof ExcordNative,
          frames: (globalThis as any).__excordWorkload?.frames,
          probe: Array.from(
            document.querySelectorAll<HTMLIFrameElement>(
              'iframe[src$="__excord_frame_probe"]',
            ),
          ).map((frame) => ({
            src: frame.src,
            display: getComputedStyle(frame).display,
            visibility: getComputedStyle(frame).visibility,
            width: frame.getBoundingClientRect().width,
            height: frame.getBoundingClientRect().height,
          })),
          peers: (globalThis as any).__excordTestPeers?.map(
            (peer: RTCPeerConnection) => ({
              state: peer.connectionState,
              ice: peer.iceConnectionState,
              signaling: peer.signalingState,
            }),
          ),
        }))
        .catch(String),
    );
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
