/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SettingsStore } from "./SettingsStore";

export function syncSettings<T extends object>(
    store: SettingsStore<T>,
    send: (settings: T, path: string) => unknown,
    subscribe: (callback: (settings: T) => void) => void
) {
    let receiving = false;
    store.addGlobalChangeListener((settings, path) => {
        if (!receiving) send(settings, path);
    });

    subscribe(settings => {
        receiving = true;
        try {
            for (const key of Object.keys(store.plain) as (keyof T)[]) {
                if (!Object.hasOwn(settings, key)) delete store.plain[key];
            }
            Object.assign(store.plain, settings);
            store.markAsChanged();
        } finally {
            receiving = false;
        }
    });
}
