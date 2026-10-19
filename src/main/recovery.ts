import { app, type BrowserWindow, dialog, shell } from "electron";
import { writeFile } from "node:fs/promises";
import { release } from "node:os";

import { createDiagnosticReport } from "../excord/diagnosticReport";
import { isSafeMode } from "../excord/mode";
import { DATA_DIR } from "./constants";

const events: {
  kind: "navigation-failed" | "renderer-gone" | "startup-failed";
  code: number;
}[] = [];
export function recordRecoveryEvent(
  kind: (typeof events)[number]["kind"],
  code = 0,
) {
  events.push({ kind, code });
  if (events.length > 50) events.shift();
}
export function restartExcord(safeMode: boolean) {
  const args = process.argv
    .slice(1)
    .filter((arg) => arg !== "--safe-mode" && arg !== "--start-minimized");
  if (safeMode) args.push("--safe-mode");
  app.relaunch({ args });
  app.quit();
}
export async function openProfileFolder() {
  const error = await shell.openPath(DATA_DIR);
  if (error) console.warn("[Excord] Could not open the profile folder:", error);
}
export async function exportDiagnostics(win?: BrowserWindow) {
  const options = {
    title: "Save Excord diagnostics",
    defaultPath: `excord-diagnostics-${app.getVersion()}.json`,
    filters: [{ name: "JSON report", extensions: ["json"] }],
  };
  const selected = await (win
    ? dialog.showSaveDialog(win, options)
    : dialog.showSaveDialog(options));
  if (selected.canceled || !selected.filePath) return false;
  const { getDiagnostics } = await import("../excord/service");
  const report = createDiagnosticReport(
    getDiagnostics(),
    {
      version: app.getVersion(),
      revision: EQUIBOP_GIT_HASH,
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      platform: process.platform,
      architecture: process.arch,
      osRelease: release(),
      safeMode: isSafeMode,
      packaged: app.isPackaged,
    },
    events,
  );
  await writeFile(selected.filePath, JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  return true;
}
export async function showStartupFailure(error: unknown) {
  console.error("[Excord] Startup failed", error);
  recordRecoveryEvent("startup-failed");
  const { response } = await dialog.showMessageBox({
    type: "error",
    title: "Excord could not start",
    message: "Excord could not load its plugins or settings.",
    detail:
      "Safe mode opens Discord without plugins or themes. Your login, settings, and plugin folders are kept. You can also open your profile folder to inspect or back up its files.",
    buttons: ["Restart in safe mode", "Open profile folder", "Quit"],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 0 && !isSafeMode) restartExcord(true);
  else {
    if (response === 1) await shell.openPath(DATA_DIR);
    app.quit();
  }
}
