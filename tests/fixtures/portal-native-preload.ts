import { contextBridge, ipcRenderer } from "electron";
import { installExcordBridge } from "../../src/excord/preload";
contextBridge.exposeInMainWorld("__EXCORD_PORTAL_NATIVE__", true);
installExcordBridge();

contextBridge.exposeInMainWorld("PortalTest", { call: (command: string, value: unknown) => ipcRenderer.invoke("portal-test", command, value) });
