/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { dialog, shell } from "electron";

import { createTrayUpdater } from "../excord/trayUpdates";
import { RELEASES_URL } from "../excord/updateFeed";
import { updates } from "./updater";

const updateFromTray = createTrayUpdater(
  updates,
  async (options) => {
    const { response } = await dialog.showMessageBox({
      ...options,
      title: "Update Excord",
      type: "info",
      defaultId: options.buttons.length - 1,
      cancelId: options.buttons.length - 1,
      noLink: true,
    });
    return response;
  },
  () => shell.openExternal(RELEASES_URL),
);

export function updateExcordFromTray() {
  void updateFromTray().catch((error) => {
    console.error("[Tray] Update failed:", error);
    dialog.showErrorBox(
      "Excord update failed",
      "Could not complete the update. Try Update Excord again.",
    );
  });
}
