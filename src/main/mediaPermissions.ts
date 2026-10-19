/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { session, systemPreferences } from "electron";
import { isDiscordOrigin } from "../excord/origin";

export function registerMediaPermissionsHandler() {
    session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
        if (!contents || !isDiscordOrigin(contents.getURL()) || !isDiscordOrigin(requestingOrigin)) return false;
        if (process.platform === "darwin" && permission === "media") {
            if (details.mediaType === "audio") return systemPreferences.getMediaAccessStatus("microphone") === "granted";
            if (details.mediaType === "video") return systemPreferences.getMediaAccessStatus("camera") === "granted";
            return false;
        }
        return true;
    });

    session.defaultSession.setPermissionRequestHandler(async (_webContents, permission, callback, details) => {
        if (!isDiscordOrigin(_webContents.getURL()) || !isDiscordOrigin(details.requestingUrl)) return callback(false);
        let granted = true;

        try {
        if (process.platform === "darwin" && "mediaTypes" in details) {
            if (details.mediaTypes?.includes("audio")) {
                granted &&= await systemPreferences.askForMediaAccess("microphone");
            }
            if (details.mediaTypes?.includes("video")) {
                granted &&= await systemPreferences.askForMediaAccess("camera");
            }
        }
        callback(granted);
        } catch { console.warn("[Excord] Media permission request failed"); callback(false); }
    });
}
