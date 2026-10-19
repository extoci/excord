/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "path";
import { DefaultExcordSettings } from "shared/defaultSettings";
import type { Settings as TSettings, State as TState } from "shared/settings";
import { SettingsStore } from "shared/utils/SettingsStore";

import { DATA_DIR, VENCORD_SETTINGS_FILE } from "./constants";
import { mergeDefaults } from "./utils/mergeDefaults";
import { readSettingsFile, writeSettingsFile } from "./utils/settingsFile";

const SETTINGS_FILE = join(DATA_DIR, "settings.json");
const STATE_FILE = join(DATA_DIR, "state.json");

function migrateSettings(settings: any) {
    if (typeof settings.customTitleBar === "boolean") {
        settings.nativeTitleBar ??= !settings.customTitleBar;
        delete settings.customTitleBar;
    }
}

function loadSettings<T extends object = any>(file: string, name: string, defaults?: T) {
    let settings = {} as T;
    let readFailed = false;
    try {
        settings = readSettingsFile(file) as T;
    } catch (error) { readFailed = true; console.error(`[Excord] Cannot read ${name}; original file left untouched.`, error); }

    if (defaults) {
        migrateSettings(settings);
        for (const key of Object.keys(defaults) as (keyof T)[]) {
            if (settings[key] != null && typeof settings[key] !== typeof defaults[key]) settings[key] = defaults[key];
        }
        mergeDefaults(settings, defaults);
    }

    const store = new SettingsStore(settings);
    store.addGlobalChangeListener(o => {
        if (readFailed) return;
        try {
            writeSettingsFile(file, o);
        } catch (err) {
            console.error(`Failed to save settings to ${name}.json:`, err);
        }
    });

    return store;
}

export const Settings = loadSettings<TSettings>(SETTINGS_FILE, "Excord settings", DefaultExcordSettings);
export const VencordSettings = loadSettings<any>(VENCORD_SETTINGS_FILE, "Vencord settings");
export const State = loadSettings<TState>(STATE_FILE, "Excord state");
