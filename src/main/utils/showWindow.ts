/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow } from "electron";

export function showWindow(
    win: Pick<BrowserWindow, "isDestroyed" | "isMinimized" | "restore" | "show" | "focus"> | undefined
) {
    if (!win || win.isDestroyed()) return false;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return true;
}
