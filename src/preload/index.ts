/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { contextBridge, ipcRenderer, webFrame } from "electron/renderer";

import { IpcEvents } from "../shared/IpcEvents";
import { VesktopNative } from "./VesktopNative";
import { installExcordBridge } from "../excord/preload";
import { isDiscordOrigin } from "../excord/origin";

if (process.isMainFrame && isDiscordOrigin(location.href)) {
  installExcordBridge();
  contextBridge.exposeInMainWorld("VesktopNative", VesktopNative);

  // Pass the sandbox APIs used by the bundled preload. Electron 45 removed
  // Buffer and the immediate-timer globals that were previously passed here.
  Function(
    "require",
    "process",
    ipcRenderer.sendSync(IpcEvents.GET_VENCORD_PRELOAD_SCRIPT),
  )(require, process);

  webFrame.executeJavaScript(
    ipcRenderer.sendSync(IpcEvents.GET_VENCORD_RENDERER_SCRIPT),
  );
  webFrame.executeJavaScript(
    ipcRenderer.sendSync(IpcEvents.GET_VESKTOP_RENDERER_SCRIPT),
  );
}
