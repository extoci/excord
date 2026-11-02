import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import type { State } from "../src/shared/settings";
import { restoreWindowMaximized, trackWindowState } from "../src/main/windowState";

class Window extends EventEmitter {
    visible = true;
    isVisible() { return this.visible; }
    maximize() { this.maximized = true; }
    maximized = false;
    minimized = false;
    fullScreen = false;
    bounds = { x: 30, y: 40, width: 1100, height: 800 };
    isMaximized() { return this.maximized; }
    isMinimized() { return this.minimized; }
    isFullScreen() { return this.fullScreen; }
    getBounds() { return { ...this.bounds }; }
    getNormalBounds() { return { x: 30, y: 40, width: 1100, height: 800 }; }
}
for (const mode of ["minimized", "fullScreen"] as const) {
    test(`${mode} geometry does not overwrite the restored window size`, () => {
        const win = new Window();
        const state: State = { windowBounds: { ...win.bounds } };
        trackWindowState(win as unknown as BrowserWindow, state);
        win[mode] = true;
        win.bounds = { x: 0, y: 0, width: 1920, height: 1080 };
        win.emit("resize");
        win.emit("move");
        expect(state.windowBounds).toEqual(win.getNormalBounds());
    });
}
test("normal resize saves the normal bounds and state transitions retain geometry", () => {
    const win = new Window();
    const state: State = {};
    trackWindowState(win as unknown as BrowserWindow, state);
    win.emit("resize");
    expect(state.windowBounds).toEqual(win.getNormalBounds());
    win.maximized = true;
    win.emit("maximize");
    expect(state.maximized).toBe(true);
    win.bounds.width = 1920;
    win.emit("resize");
    expect(state.windowBounds?.width).toBe(1100);
    win.maximized = false;
    win.emit("unmaximize");
    expect(state.maximized).toBe(false);
});

for (const visible of [true, false]) {
    test(`startup visible=${visible} restores maximization only once`, () => {
        const win = new Window();
        win.visible = visible;
        restoreWindowMaximized(win as unknown as BrowserWindow);
        if (!visible) {
            expect(win.maximized).toBe(false);
            win.visible = true;
            win.emit("show");
        }
        expect(win.maximized).toBe(true);
        win.maximized = false;
        win.emit("show");
        expect(win.maximized).toBe(false);
        expect(win.listenerCount("show")).toBe(0);
    });
}
