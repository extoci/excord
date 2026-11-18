import { expect, test } from "bun:test";

import { DefaultExcordSettings } from "../src/shared/defaultSettings";
import { DesktopBooleanSettings, isSettingDisabled, isSettingVisible } from "../src/shared/desktopSettings";
import { applySettingsPatch } from "../src/shared/settingsPatch";
import { SettingsChoices, validateDesktopSetting } from "../src/shared/settingsWindow";

test("desktop metadata contains unique boolean settings with usable descriptions", () => {
    const options = Object.values(DesktopBooleanSettings).flat();
    expect(options.length).toBe(19);
    expect(new Set(options.map(option => option.key)).size).toBe(options.length);
    for (const option of options) {
        expect(typeof DefaultExcordSettings[option.key]).toBe("boolean");
        expect(option.title.length).toBeGreaterThan(0);
        expect(option.description.length).toBeGreaterThan(0);
        expect(validateDesktopSetting(option.key, true)).toBe(true);
        expect(validateDesktopSetting(option.key, false)).toBe(true);
        for (const value of [null, undefined, "true", 1, {}])
            expect(validateDesktopSetting(option.key, value)).toBe(false);
    }
});

test("desktop dependencies and macOS visibility remain declarative", () => {
    const options = Object.values(DesktopBooleanSettings).flat();
    const video = options.find(option => option.key === "hardwareVideoAcceleration")!;
    expect(isSettingDisabled(video, { ...DefaultExcordSettings, hardwareAcceleration: false })).toBe(true);
    expect(isSettingDisabled(video, { ...DefaultExcordSettings, hardwareAcceleration: true })).toBe(false);
    for (const key of ["tray", "minimizeToTray"]) {
        const option = options.find(option => option.key === key)!;
        expect(isSettingVisible(option, "darwin")).toBe(false);
        expect(isSettingVisible(option, "win32")).toBe(true);
        expect(isSettingVisible(option, "linux")).toBe(true);
    }
    expect(isSettingVisible(video, "darwin")).toBe(true);
    const shadow = options.find(option => option.key === "enableShadow")!;
    expect(isSettingDisabled(shadow, { ...DefaultExcordSettings, nativeTitleBar: true })).toBe(true);
    expect(isSettingDisabled(shadow, { ...DefaultExcordSettings, nativeTitleBar: false })).toBe(false);
});

test("standalone validation rejects unknown, empty, privileged and malformed settings", () => {
    for (const key of [
        "",
        null,
        undefined,
        {},
        "__proto__",
        "constructor",
        "audio",
        "arRPCWebSocketCustomHost",
        "autoDownloadUpdates"
    ]) {
        expect(validateDesktopSetting(key, true)).toBe(false);
    }
    for (const [key, values] of Object.entries(SettingsChoices)) {
        for (const value of values) expect(validateDesktopSetting(key, value)).toBe(true);
        for (const value of ["", "invalid", true, null, undefined])
            expect(validateDesktopSetting(key, value)).toBe(false);
    }
});

test("a stale Discord renderer cannot overwrite another preference when saving its changed path", () => {
    const stale = { ...DefaultExcordSettings, staticTitle: true };
    const main = { ...DefaultExcordSettings, backgroundEfficiency: false };
    const result = applySettingsPatch(main, stale, "staticTitle");
    expect(result.staticTitle).toBe(true);
    expect(result.backgroundEfficiency).toBe(false);
    expect(main.staticTitle).toBe(false);
    expect(applySettingsPatch(main, stale)).toEqual(stale);
    expect(() => applySettingsPatch(main, stale, "__proto__.polluted")).toThrow();
    expect(() => applySettingsPatch(main, stale, "audio..mute")).toThrow();
});

test("settings path patches preserve sibling values and support deletion", () => {
    const current = { audio: { mute: true, onlySpeakers: true } };
    expect(applySettingsPatch(current, { audio: { mute: false, onlySpeakers: false } }, "audio.mute")).toEqual({
        audio: { mute: false, onlySpeakers: true }
    });
    expect(applySettingsPatch<{ a?: number; b: number }>({ a: 1, b: 2 }, { b: 3 }, "a")).toEqual({ b: 2 });
});
