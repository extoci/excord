/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { contextBridge, ipcRenderer } from "electron/renderer";

import { IpcEvents } from "../shared/IpcEvents";

contextBridge.exposeInMainWorld("ExcordSettingsNative", {
    get: () => ipcRenderer.invoke(IpcEvents.SETTINGS_WINDOW_GET),
    set: (key: string, value: unknown) => ipcRenderer.invoke(IpcEvents.SETTINGS_WINDOW_SET, key, value),
    open: (name: string) => ipcRenderer.invoke(IpcEvents.SETTINGS_WINDOW_OPEN, name),
    onChange: (callback: (snapshot: unknown) => void) => {
        const listener = (_event: unknown, snapshot: unknown) => callback(snapshot);
        ipcRenderer.on(IpcEvents.SETTINGS_WINDOW_CHANGED, listener);
        return () => ipcRenderer.removeListener(IpcEvents.SETTINGS_WINDOW_CHANGED, listener);
    },
    getUpdateState: () => ipcRenderer.invoke(IpcEvents.SETTINGS_WINDOW_UPDATE_GET),
    updateAction: (action: string) => ipcRenderer.invoke(IpcEvents.SETTINGS_WINDOW_UPDATE_ACTION, action),
    onUpdateState: (callback: (state: unknown) => void) => {
        const listener = (_event: unknown, state: unknown) => callback(state);
        ipcRenderer.on(IpcEvents.SETTINGS_WINDOW_UPDATE_CHANGED, listener);
        return () => ipcRenderer.removeListener(IpcEvents.SETTINGS_WINDOW_UPDATE_CHANGED, listener);
    }
});
