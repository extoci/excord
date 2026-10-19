import { app, BrowserWindow, dialog, ipcMain, session, webContents } from "electron";
import { developerPortal } from "../../src/main/developerPortal";
import { ExcordChannels } from "../../src/excord/channels";

void (async () => {
app.setPath("userData", process.env.EXCORD_PORTAL_TEST_PROFILE!);
await app.whenReady();
(globalThis as any).__portalFail = false;
// This fixture intercepts all HTTPS traffic. No Discord account or network is used.
session.defaultSession.protocol.handle("https", () => (globalThis as any).__portalFail ? Response.error() : new Response('<!doctype html><title>Portal lifecycle fixture</title>', { headers: { "content-type": "text/html" } }));
const win = new BrowserWindow({ width: 1200, height: 800, webPreferences: { preload: process.env.EXCORD_PORTAL_TEST_PRELOAD!, nodeIntegration: false, contextIsolation: true, sandbox: true } });
(globalThis as any).__portalWindow = win;
for (const [channel, action] of [[ExcordChannels.openPortal, "open"], [ExcordChannels.closePortal, "back"], [ExcordChannels.reloadPortal, "reload"]] as const)
    ipcMain.handle(channel, event => {
        if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw Error("Not the main window");
        developerPortal(win)[action]();
    });
ipcMain.handle("portal-test", async (event, command, value) => {
    if (event.sender !== win.webContents) throw Error("Not the test host");
    const view = win.contentView.children.find((view: any) => view.webContents && view.webContents !== win.webContents) as any;
    if (command === "snapshot") return view ? { id: view.webContents.id, bounds: view.getBounds(), hostSize: win.getContentSize(), url: view.webContents.getURL(), loading: view.webContents.isLoading(), sameSession: view.webContents.session === win.webContents.session } : null;
    if (command === "mainId") return win.webContents.id;
    if (command === "destroyed") return !webContents.fromId(value);
    if (command === "isolation") return view.webContents.executeJavaScript('({bridge:typeof ExcordNative,mod:typeof Vencord,desktop:typeof VesktopNative,node:typeof require,opener:window.opener===null})');
    if (command === "unsaved") {
        dialog.showMessageBoxSync = () => 0;
        await view.webContents.executeJavaScript("window.onbeforeunload = () => false; undefined", true);
        return;
    }
    if (command === "discard") { dialog.showMessageBoxSync = () => 1; return; }
    if (command === "resize") { win.setContentSize(1000, 700); return; }
    if (command === "zoom") { win.webContents.setZoomFactor(1.25); win.emit("resize"); return; }
    if (command === "fail") { (globalThis as any).__portalFail = value; return; }
});
win.on("closed", () => app.quit());
await win.loadFile(process.env.EXCORD_PORTAL_TEST_HTML!);

})();
