import { expect, test } from "bun:test";

import { SettingsStore } from "../src/shared/utils/SettingsStore";
import { syncSettings } from "../src/shared/utils/syncSettings";

function setup() {
    const store = new SettingsStore<{ flashFrame?: boolean; enableMenu?: boolean }>({ flashFrame: true });
    const writes: { settings: typeof store.plain; path: string }[] = [];
    let receive!: (settings: typeof store.plain) => void;
    syncSettings(
        store,
        (settings, path) => writes.push({ settings: { ...settings }, path }),
        callback => {
            receive = callback;
        }
    );
    return { store, writes, receive };
}

test("main updates the existing renderer store and UI listeners without an IPC echo", () => {
    const { store, writes, receive } = setup();
    const reference = store.store;
    let notifications = 0;
    store.addGlobalChangeListener(() => notifications++);
    receive({ flashFrame: false, enableMenu: true });
    expect(store.store).toBe(reference);
    expect(reference.flashFrame).toBe(false);
    expect(reference.enableMenu).toBe(true);
    expect(notifications).toBe(1);
    expect(writes).toEqual([]);
});

test("renderer writes still forward their changed path before and after a main update", () => {
    const { store, writes, receive } = setup();
    store.store.flashFrame = false;
    receive({ flashFrame: false, enableMenu: true });
    store.store.enableMenu = false;
    expect(writes).toEqual([
        { settings: { flashFrame: false }, path: "flashFrame" },
        { settings: { flashFrame: false, enableMenu: false }, path: "enableMenu" }
    ]);
});

test("an empty main snapshot removes old preferences without sending a write", () => {
    const { store, writes, receive } = setup();
    receive({});
    expect(store.plain).toEqual({});
    expect(store.store.flashFrame).toBeUndefined();
    expect(writes).toEqual([]);
});

test("a failing UI listener does not leave renderer writes suppressed", () => {
    const { store, writes, receive } = setup();
    const fail = () => {
        throw new Error("UI listener failed");
    };
    store.addGlobalChangeListener(fail);
    expect(() => receive({ flashFrame: false })).toThrow("UI listener failed");
    store.removeGlobalChangeListener(fail);
    store.store.flashFrame = true;
    expect(writes).toEqual([{ settings: { flashFrame: true }, path: "flashFrame" }]);
});
