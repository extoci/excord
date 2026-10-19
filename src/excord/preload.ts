import { contextBridge, ipcRenderer } from "electron/renderer";

import { ExcordChannels } from "./channels";
import type { ExcordNativeApi, LocalPluginSnapshot, PerformanceSnapshot, PluginIssue } from "./types";

const native: ExcordNativeApi = {
    getUpdateState: () => ipcRenderer.invoke(ExcordChannels.updateSnapshot),
    updateAction: action => ipcRenderer.invoke(ExcordChannels.updateAction, action),
    onUpdateState: listener => {
        const receive = (_event: Electron.IpcRendererEvent, state: import("./updates").UpdateSnapshot) => listener(state);
        ipcRenderer.on(ExcordChannels.updateState, receive);
        return () => { ipcRenderer.removeListener(ExcordChannels.updateState, receive); };
    },
    openDeveloperPortal: () => ipcRenderer.invoke(ExcordChannels.openPortal),
    closeDeveloperPortal: () => ipcRenderer.invoke(ExcordChannels.closePortal),
    reloadDeveloperPortal: () => ipcRenderer.invoke(ExcordChannels.reloadPortal),
    onDeveloperPortalState: listener => {
        const receive = (_event: Electron.IpcRendererEvent, state: import("./developerPortal").DeveloperPortalState) => listener(state);
        ipcRenderer.on(ExcordChannels.portalState, receive);
        return () => { ipcRenderer.removeListener(ExcordChannels.portalState, receive); };
    },
    setRealtimeActivity: active => ipcRenderer.send(ExcordChannels.realtimeActivity, active),
    getLocalPlugins: (): LocalPluginSnapshot => ipcRenderer.sendSync(ExcordChannels.localPlugins),
    reportIssues: (issues: PluginIssue[]) => ipcRenderer.send(ExcordChannels.reportIssues, issues),
    openPluginsFolder: (): Promise<void> => ipcRenderer.invoke(ExcordChannels.openPlugins),
    createPlugin: (name: string): Promise<string> => ipcRenderer.invoke(ExcordChannels.createPlugin, name),
    refresh: (): Promise<void> => ipcRenderer.invoke(ExcordChannels.refresh),
    diagnostics: (): Promise<PerformanceSnapshot> => ipcRenderer.invoke(ExcordChannels.diagnostics),
    openSettings: (): Promise<void> => ipcRenderer.invoke(ExcordChannels.openSettings),
    exportDiagnostics: (): Promise<boolean> => ipcRenderer.invoke(ExcordChannels.exportDiagnostics)
};
export function installExcordBridge() {
    contextBridge.exposeInMainWorld("ExcordNative", native);
}
