import { expect, test } from "bun:test";

import { showWindow } from "../src/main/utils/showWindow";

function windowStub({ destroyed = false, minimized = false } = {}) {
    const calls: string[] = [];
    return {
        calls,
        isDestroyed: () => destroyed,
        isMinimized: () => minimized,
        restore: () => {
            calls.push("restore");
        },
        show: () => {
            calls.push("show");
        },
        focus: () => {
            calls.push("focus");
        }
    };
}

test("opening a hidden main window shows and focuses it", () => {
    const win = windowStub();
    expect(showWindow(win)).toBe(true);
    expect(win.calls).toEqual(["show", "focus"]);
});

test("opening a minimized main window restores it before showing and focusing", () => {
    const win = windowStub({ minimized: true });
    expect(showWindow(win)).toBe(true);
    expect(win.calls).toEqual(["restore", "show", "focus"]);
});

test("a missing or destroyed main window is left alone", () => {
    expect(showWindow(undefined)).toBe(false);
    const win = windowStub({ destroyed: true });
    expect(showWindow(win)).toBe(false);
    expect(win.calls).toEqual([]);
});
