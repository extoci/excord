/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow } from "electron";
import type { State } from "../shared/settings";

export function trackWindowState(win: BrowserWindow, state: State) {
    const saveState = () => {
        state.maximized = win.isMaximized();
        state.minimized = win.isMinimized();
    };
    win.on("maximize", saveState);
    win.on("minimize", saveState);
    win.on("unmaximize", saveState);
    win.on("restore", saveState);
    const saveBounds = () => {
        if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
        state.windowBounds = win.getNormalBounds();
    };
    win.on("resize", saveBounds);
    win.on("move", saveBounds);
}

/** Consume startup maximization once, including windows already shown by their constructor. */
export function restoreWindowMaximized(win: BrowserWindow) {
    if (win.isVisible()) win.maximize();
    else win.once("show", () => win.maximize());
}
