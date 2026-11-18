/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { DesktopBooleanSettings } from "shared/desktopSettings";
import { IpcEvents } from "shared/IpcEvents";
import { SettingsChoices, validateDesktopSetting } from "shared/settingsWindow";

import { createArgumentsWindow } from "./arguments";
import { createArRPCWindow } from "./arrpcWindow";
import { Settings } from "./settings";
import { loadView } from "./vesktopStatic";

let settingsWindow: BrowserWindow | null = null;

function snapshot() {
  return {
    settings: Settings.plain,
    sections: DesktopBooleanSettings,
    choices: SettingsChoices,
    platform: process.platform,
  };
}

for (const channel of [
  IpcEvents.SETTINGS_WINDOW_GET,
  IpcEvents.SETTINGS_WINDOW_SET,
  IpcEvents.SETTINGS_WINDOW_OPEN,
]) {
  ipcMain.handle(channel, (event, key: unknown, value: unknown) => {
    if (
      !settingsWindow ||
      settingsWindow.isDestroyed() ||
      event.sender !== settingsWindow.webContents ||
      event.senderFrame !== settingsWindow.webContents.mainFrame ||
      event.senderFrame.url !== "excord://static/views/settings.html"
    )
      throw new Error("Invalid settings sender");
    if (channel === IpcEvents.SETTINGS_WINDOW_GET) return snapshot();
    if (channel === IpcEvents.SETTINGS_WINDOW_OPEN) {
      if (key === "richPresence") createArRPCWindow();
      else if (key === "arguments") createArgumentsWindow();
      else throw new Error("Unknown settings window");
      return;
    }
    if (!validateDesktopSetting(key, value))
      throw new Error("Invalid desktop setting");
    Object.assign(Settings.store, { [key]: value });
  });
}

Settings.addGlobalChangeListener(() => {
  if (settingsWindow && !settingsWindow.isDestroyed())
    settingsWindow.webContents.send(
      IpcEvents.SETTINGS_WINDOW_CHANGED,
      snapshot(),
    );
});

export function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }
  settingsWindow = new BrowserWindow({
    title: "Excord Settings",
    width: 680,
    height: 760,
    minWidth: 480,
    minHeight: 400,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "settingsPreload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  settingsWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  void loadView(settingsWindow, "settings.html");
  return settingsWindow;
}
