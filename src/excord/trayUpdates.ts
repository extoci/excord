/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UpdateController } from "./updates";

export interface TrayUpdateDialog {
  message: string;
  detail: string;
  buttons: string[];
}

/** Native update flow shared by both tray implementations. Never opens Discord. */
export function createTrayUpdater(
  updates: UpdateController,
  showDialog: (options: TrayUpdateDialog) => Promise<number>,
  openReleases: () => Promise<void>,
) {
  let active: Promise<void> | undefined;

  async function run() {
    let state = updates.snapshot();
    if (["idle", "checking", "available"].includes(state.phase)) {
      await updates.check();
      state = updates.snapshot();
    }

    if (state.phase === "available" && !state.error) {
      const response = await showDialog({
        message: `Download Excord ${state.version}?`,
        detail:
          "Excord will keep running while the update downloads. You can choose when to restart.",
        buttons: ["Download update", "Cancel"],
      });
      if (response !== 0) return;
      await updates.action("download");
      state = updates.snapshot();
    }

    if (state.phase === "ready") {
      const response = await showDialog({
        message: `Excord ${state.version} is ready to install`,
        detail: [
          state.error,
          "Restart Excord to install the update. This will disconnect any active call.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        buttons: ["Restart and update", "Later"],
      });
      if (response === 0) await updates.action("restart");
      return;
    }

    const manual = state.phase === "manual" || state.phase === "unsupported";
    const response = await showDialog({
      message: state.error
        ? "Excord update needs attention"
        : manual
          ? "Download an Excord installer"
          : state.phase === "downloading"
            ? "Excord is downloading an update"
            : state.phase === "installing"
              ? "Excord is installing an update"
              : state.phase === "available"
                ? "Excord update is available"
                : "Excord is up to date",
      detail:
        state.error ??
        (manual
          ? "Automatic installation is unavailable for this build. Download the latest installer from Releases."
          : state.phase === "downloading"
            ? `${Math.floor(state.progress)}% downloaded. Choose Update Excord again when the download finishes to restart and install.`
            : state.phase === "installing"
              ? "Excord will restart when installation finishes."
              : state.phase === "available"
                ? "The download was cancelled. Choose Update Excord again to retry."
                : `You are running Excord ${state.currentVersion}.`),
      buttons: manual || state.error ? ["Open Releases", "Close"] : ["Close"],
    });
    if (response === 0 && (manual || state.error)) await openReleases();
  }

  return () => {
    active ??= run().finally(() => {
      active = undefined;
    });
    return active;
  };
}
