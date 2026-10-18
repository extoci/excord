/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain } from "electron";

import PluginNatives from "~pluginNatives";

const PluginIpcMappings = {} as Record<string, Record<string, string>>;
export type PluginIpcMappings = typeof PluginIpcMappings;

export function registerPluginNatives(plugin: string, methods: Record<string, Function>) {
    if (Object.hasOwn(PluginIpcMappings, plugin)) throw new Error(`Native methods already exist for ${plugin}`);
    const entries = Object.entries(methods);
    if (!entries.length) return;

    const mappings = PluginIpcMappings[plugin] = {};

    for (const [methodName, method] of entries) {
        const key = `VencordPluginNative_${plugin}_${methodName}`;
        ipcMain.handle(key, (event, ...args) => {
            const frame = event.senderFrame;
            if (!frame) throw new Error("Plugin IPC has no sender frame");
            const url = new URL(frame.url);
            if (url.protocol !== "https:" || !["discord.com", "canary.discord.com", "ptb.discord.com"].includes(url.hostname)) {
                throw new Error("Plugin IPC requires a trusted Discord page");
            }
            return method(event, ...args);
        });
        mappings[methodName] = key;
    }
}

export function unregisterPluginNatives(plugin: string) {
    const mappings = PluginIpcMappings[plugin];
    if (!mappings) return;
    for (const key of Object.values(mappings)) ipcMain.removeHandler(key);
    delete PluginIpcMappings[plugin];
}

for (const [plugin, methods] of Object.entries(PluginNatives)) registerPluginNatives(plugin, methods);

ipcMain.on(IpcEvents.GET_PLUGIN_IPC_METHOD_MAP, e => {
    e.returnValue = PluginIpcMappings;
});
