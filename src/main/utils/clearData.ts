/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, dialog } from "electron";
import { DATA_DIR, MessageBoxChoice } from "main/constants";
import { backupSettingsForReset } from "./settingsFile";

export async function clearData(win: BrowserWindow) {
    const { response } = await dialog.showMessageBox(win, {
        message: "Are you sure you want to reset Excord?",
        detail: "This logs you out and resets settings and QuickCSS. Existing settings are backed up in your profile's backups folder. Personal plugin and theme folders are kept.\n\nExcord will restart. Use safe mode instead if you want to keep your login.",
        buttons: ["Yes", "No"],
        cancelId: MessageBoxChoice.Cancel,
        defaultId: MessageBoxChoice.Cancel,
        type: "warning"
    });

    if (response === MessageBoxChoice.Cancel) return;

    await win.webContents.session.clearStorageData();
    await win.webContents.session.clearCache();
    await win.webContents.session.clearCodeCaches({});
    backupSettingsForReset(DATA_DIR);

    app.relaunch();
    app.quit();
}
