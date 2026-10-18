import { contextBridge, ipcRenderer } from "electron/renderer";

import { ExcordChannels } from "./channels";
import type { ExcordNativeApi, LocalPluginSnapshot, PerformanceSnapshot, PluginIssue } from "./types";

const native: ExcordNativeApi = {
    getLocalPlugins: (): LocalPluginSnapshot => ipcRenderer.sendSync(ExcordChannels.localPlugins),
    reportIssues: (issues: PluginIssue[]) => ipcRenderer.send(ExcordChannels.reportIssues, issues),
    openPluginsFolder: (): Promise<void> => ipcRenderer.invoke(ExcordChannels.openPlugins),
    createPlugin: (name: string): Promise<string> => ipcRenderer.invoke(ExcordChannels.createPlugin, name),
    refresh: (): Promise<void> => ipcRenderer.invoke(ExcordChannels.refresh),
    diagnostics: (): Promise<PerformanceSnapshot> => ipcRenderer.invoke(ExcordChannels.diagnostics),
    openSettings: (): Promise<void> => ipcRenderer.invoke(ExcordChannels.openSettings)
};
contextBridge.exposeInMainWorld("ExcordNative", native);
