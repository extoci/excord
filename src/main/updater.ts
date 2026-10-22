/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CancellationToken } from "builder-util-runtime";
import { app, BrowserWindow, net } from "electron";
import { autoUpdater } from "electron-updater";
import { IpcEvents } from "shared/IpcEvents";

import { ExcordChannels } from "../excord/channels";
import { isDiscordOrigin } from "../excord/origin";
import { resolveUpdateFeed } from "../excord/updateFeed";
import { UpdateController } from "../excord/updates";
import { AppEvents } from "./events";
import { State } from "./settings";
import { handle } from "./utils/ipcWrappers";

// Consent is owned by UpdateController, including after a cached download is reused.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowPrerelease = true;
autoUpdater.allowDowngrade = false;
autoUpdater.fullChangelog = false;
let cancellation: CancellationToken | undefined;
export const updates = new UpdateController({
    async check() {
        const url = await resolveUpdateFeed(net.fetch.bind(net) as typeof fetch);
        autoUpdater.setFeedURL({ provider: "generic", url, channel: "latest" });
        const result = await autoUpdater.checkForUpdates();
        if (!result?.isUpdateAvailable) return;
        const info = result.updateInfo;
        return { version: info.version, notes: typeof info.releaseNotes === "string" ? info.releaseNotes.slice(0, 16000) : undefined };
    },
    async download() {
        cancellation = new CancellationToken();
        try { await autoUpdater.downloadUpdate(cancellation); } finally { cancellation = undefined; }
    },
    cancel() { cancellation?.cancel(); },
    install(relaunch) {
        autoUpdater.autoRunAppAfterInstall = relaunch;
        autoUpdater.quitAndInstall(true, relaunch);
    }
}, app.getVersion(), app.isPackaged && ["win32", "darwin"].includes(process.platform), state => {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && !win.webContents.isDestroyed() && isDiscordOrigin(win.webContents.getURL()))
            win.webContents.send(ExcordChannels.updateState, state);
    }
}, State.store.updater?.lastCheckedAt, time => {
    State.store.updater ??= {};
    State.store.updater.lastCheckedAt = time;
});
autoUpdater.on("download-progress", progress => updates.progress(progress.percent));
// Check/download errors reject their operation promises. Install errors arrive as events.
autoUpdater.on("error", error => updates.installFailed(error));

let timer: ReturnType<typeof setTimeout> | undefined;
AppEvents.once("appLoaded", () => {
    const check = () => {
        void updates.check(true);
        timer = setTimeout(check, 24 * 60 * 60 * 1000);
        timer.unref();
    };
    timer = setTimeout(check, 60000);
    timer.unref();
});
app.on("will-quit", event => {
    if (updates.snapshot().phase === "ready" && updates.snapshot().installOnQuit) {
        event.preventDefault();
        updates.install(false);
    } else if (timer) clearTimeout(timer);
});
// Retained desktop API opens Settings, never a popup or a warning badge.
handle(IpcEvents.UPDATER_IS_OUTDATED, () => false);
handle(IpcEvents.UPDATER_OPEN, async event => {
    await event.sender.executeJavaScript('Vencord.Webpack.Common.SettingsRouter.openUserSettings("ExcordSettings")');
});
