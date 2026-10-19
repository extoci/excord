import type { BrowserWindow } from "electron";

import { BackgroundPolicy } from "../excord/backgroundPolicy";
import { AppEvents } from "./events";
import { Settings } from "./settings";

const policies = new WeakMap<BrowserWindow, BackgroundPolicy>();
export function attachBackgroundPolicy(win: BrowserWindow) {
  let desired = false;
  const apply = (allowed: boolean) => {
    desired = allowed;
    if (win.isDestroyed()) return;
    // Electron 43 does not restore a hidden page's visibility when this setter
    // is re-enabled. Apply on show, without briefly showing a hidden window.
    if (allowed && !win.isVisible()) return;
    if (win.webContents.getBackgroundThrottling() !== allowed)
      win.webContents.setBackgroundThrottling(allowed);
  };
  const policy = new BackgroundPolicy(
    apply,
    Settings.store.backgroundEfficiency,
  );
  win.on("show", () => apply(desired));
  policies.set(win, policy);
  const configure = () => policy.configure(Settings.store.backgroundEfficiency);
  const voiceCall = (active: boolean) => policy.voiceCall(active);
  Settings.addChangeListener("backgroundEfficiency", configure);
  AppEvents.on("voiceCallStateChanged", voiceCall);
  win.webContents.on(
    "did-start-navigation",
    (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) policy.navigation();
    },
  );
  win.once("closed", () => {
    Settings.removeChangeListener("backgroundEfficiency", configure);
    AppEvents.off("voiceCallStateChanged", voiceCall);
  });
}
export function setRealtimeActivity(win: BrowserWindow, active: boolean) {
  policies.get(win)?.activity(active);
}
