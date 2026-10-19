import { type BrowserWindow, dialog, shell, WebContentsView } from "electron";

import { ExcordChannels } from "../excord/channels";
import { DEVELOPER_PORTAL_URL, isDeveloperPortalUrl, PORTAL_BANNER_HEIGHT, type DeveloperPortalState } from "../excord/developerPortal";

const controllers = new WeakMap<BrowserWindow, DeveloperPortal>();

export function developerPortal(win: BrowserWindow) {
    let controller = controllers.get(win);
    if (!controller) controllers.set(win, controller = new DeveloperPortal(win));
    return controller;
}

class DeveloperPortal {
    private view?: WebContentsView;
    private generation = 0;
    private returning = false;
    private state: DeveloperPortalState = { open: false, loading: false, failed: false };

    constructor(private win: BrowserWindow) {
        win.on("resize", () => this.resize());
        win.webContents.on("zoom-changed", () => { setImmediate(() => this.resize()); });
        win.once("closed", () => this.close());
        win.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
            if (mainFrame && !inPlace) this.close();
        });
    }

    private publish(state: DeveloperPortalState) {
        this.state = state;
        if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed())
            this.win.webContents.send(ExcordChannels.portalState, state);
    }

    private resize() {
        if (!this.view || this.win.isDestroyed()) return;
        const [width, height] = this.win.getContentSize();
        const banner = Math.round(PORTAL_BANNER_HEIGHT * this.win.webContents.getZoomFactor());
        this.view.setBounds({ x: 0, y: banner, width, height: Math.max(0, height - banner) });
    }

    open() {
        if (this.win.isDestroyed()) return;
        if (this.view) { this.publish(this.state); this.view.webContents.focus(); return; }
        // Share the browser session for the ordinary Discord login flow. No modification preload.
        const view = this.view = new WebContentsView({ webPreferences: {
            session: this.win.webContents.session, nodeIntegration: false, sandbox: true,
            contextIsolation: true, backgroundThrottling: true
        } });
        const generation = ++this.generation;
        const current = () => this.view === view && this.generation === generation && !view.webContents.isDestroyed();
        const external = (url: string) => {
            try {
                const parsed = new URL(url);
                if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password)
                    void shell.openExternal(url).catch(() => {});
            } catch {}
        };
        view.webContents.once("destroyed", () => { if (this.view === view) this.close(); });
        view.webContents.on("will-prevent-unload", event => {
            const choice = dialog.showMessageBoxSync(this.win, {
                type: "question", title: "Developer Portal", message: "Leave Developer Portal?",
                detail: "The portal has unsaved changes. Leaving may discard them.",
                buttons: ["Keep editing", "Leave portal"], defaultId: 0, cancelId: 0
            });
            if (choice === 1) event.preventDefault();
        });
        view.webContents.setWindowOpenHandler(({ url }) => {
            if (isDeveloperPortalUrl(url)) void view.webContents.loadURL(url).catch(() => {});
            else external(url);
            return { action: "deny" };
        });
        view.webContents.on("will-navigate", (event, url) => {
            if (!isDeveloperPortalUrl(url)) { event.preventDefault(); external(url); }
        });
        view.webContents.on("will-redirect", (event, url, _inPlace, mainFrame) => {
            if (mainFrame && !isDeveloperPortalUrl(url)) {
                event.preventDefault();
                this.publish({ open: true, loading: false, failed: true });
            }
        });
        view.webContents.on("did-start-loading", () => {
            if (current()) this.publish({ open: true, loading: true, failed: false });
        });
        view.webContents.on("did-finish-load", () => {
            if (current() && this.returning && view.webContents.getURL() === "about:blank") this.close();
        });
        view.webContents.on("did-stop-loading", () => {
            if (current()) this.publish({ ...this.state, loading: false });
        });
        view.webContents.on("render-process-gone", () => {
            if (current()) this.publish({ open: true, loading: false, failed: true });
        });
        view.webContents.on("did-fail-load", (_event, code, _message, _url, mainFrame) => {
            if (current() && mainFrame && code !== -3) this.publish({ open: true, loading: false, failed: true });
        });
        view.webContents.on("before-input-event", (event, input) => {
            if (input.type === "keyDown" && (input.key === "F5" || ((input.control || input.meta) && input.key.toLowerCase() === "r"))) {
                event.preventDefault(); this.reload();
            }
        });
        this.win.contentView.addChildView(view);
        this.resize();
        this.publish({ open: true, loading: true, failed: false });
        void view.webContents.loadURL(DEVELOPER_PORTAL_URL).catch(() => {
            if (current()) this.publish({ open: true, loading: false, failed: true });
        });
        view.webContents.focus();
    }

    reload() {
        if (!this.view || this.view.webContents.isDestroyed()) return;
        // Always retry the portal entry point after a failed or blocked navigation.
        const view = this.view;
        void view.webContents.loadURL(DEVELOPER_PORTAL_URL).catch(() => {
            if (this.view === view) this.publish({ open: true, loading: false, failed: true });
        });
    }

    back() {
        const view = this.view;
        if (!view || this.returning) return;
        this.returning = true;
        // Navigate first so the site's beforeunload guard can cancel leaving. The
        // native view is destroyed only after that navigation completes.
        void view.webContents.loadURL("about:blank").catch(() => {
            if (this.view === view) {
                this.returning = false;
                this.publish({ open: true, loading: false, failed: false });
            }
        });
    }

    close() {
        const view = this.view;
        this.returning = false;
        this.view = undefined;
        this.generation++;
        if (view) {
            if (!this.win.isDestroyed()) this.win.contentView.removeChildView(view);
            if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
        }
        this.publish({ open: false, loading: false, failed: false });
        if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed()) this.win.webContents.focus();
    }
}
