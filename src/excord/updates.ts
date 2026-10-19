export type UpdateAction = "check" | "download" | "cancel" | "install-on-quit" | "keep-current" | "restart";
export interface UpdateSnapshot {
    revision: number;
    currentVersion: string;
    phase: "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "unsupported";
    version?: string;
    notes?: string;
    progress: number;
    installOnQuit: boolean;
    lastCheckedAt?: number;
    error?: string;
}
export interface UpdateDriver {
    check(): Promise<{ version: string; notes?: string; } | undefined>;
    download(): Promise<void>;
    cancel(): void;
    install(relaunch: boolean): void;
}
export const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

/** Owns consent and operation ordering. No window, notification, or startup dependency. */
export class UpdateController {
    private state: UpdateSnapshot;
    private checking?: Promise<void>;
    private downloading?: Promise<void>;
    private cancelled = false;
    constructor(private driver: UpdateDriver, version: string, supported: boolean,
        private publish: (state: UpdateSnapshot) => void, lastCheckedAt?: number,
        private checked: (time: number) => void = () => {}, private now = Date.now) {
        this.state = { revision: 0, currentVersion: version, phase: supported ? "idle" : "unsupported", progress: 0, installOnQuit: false, lastCheckedAt };
    }
    snapshot(): UpdateSnapshot { return { ...this.state }; }
    private set(update: Partial<UpdateSnapshot>) {
        this.state = { ...this.state, ...update, revision: this.state.revision + 1 };
        this.publish(this.snapshot());
    }
    async action(action: UpdateAction): Promise<void> {
        switch (action) {
            case "check": return this.check();
            case "download": return this.download();
            case "cancel":
                if (this.state.phase === "downloading") { this.cancelled = true; this.driver.cancel(); }
                return;
            case "install-on-quit":
                if (this.state.phase === "ready") this.set({ installOnQuit: true });
                return;
            case "keep-current": this.set({ installOnQuit: false }); return;
            case "restart": this.install(true); return;
            default: throw new Error("Unknown update action");
        }
    }
    async check(automatic = false): Promise<void> {
        if (this.checking) return this.checking;
        if (!["idle", "available"].includes(this.state.phase)) return;
        if (automatic && this.state.lastCheckedAt != null && this.now() >= this.state.lastCheckedAt && this.now() - this.state.lastCheckedAt < UPDATE_CHECK_INTERVAL) return;
        const lastCheckedAt = this.now();
        try { this.checked(lastCheckedAt); } catch { /* A read-only profile must not break updates. */ }
        this.set({ phase: "checking", error: undefined, lastCheckedAt });
        this.checking = Promise.resolve().then(() => this.driver.check()).then(update => {
            this.set({ phase: update ? "available" : "idle", version: update?.version, notes: update?.notes, progress: 0 });
        }).catch(() => {
            this.set({ phase: "idle", version: undefined, notes: undefined, error: "Couldn’t check for updates. Try again when you’re connected." });
        }).finally(() => { this.checking = undefined; });
        return this.checking;
    }
    progress(percent: number) {
        if (this.state.phase === "downloading" && !this.cancelled && Number.isFinite(percent))
            this.set({ progress: Math.max(0, Math.min(100, percent)) });
    }
    private async download(): Promise<void> {
        if (this.downloading) return this.downloading;
        if (this.state.phase !== "available") return;
        this.cancelled = false;
        this.set({ phase: "downloading", progress: 0, error: undefined, installOnQuit: false });
        this.downloading = Promise.resolve().then(() => this.cancelled ? undefined : this.driver.download()).then(() => {
            this.set({ phase: this.cancelled ? "available" : "ready", progress: this.cancelled ? 0 : 100 });
        }).catch(() => {
            this.set({ phase: "available", progress: 0, error: this.cancelled ? undefined : "Couldn’t download the update. Your current version is still running." });
        }).finally(() => { this.downloading = undefined; });
        return this.downloading;
    }
    install(relaunch: boolean): boolean {
        if (this.state.phase !== "ready" || (!relaunch && !this.state.installOnQuit)) return false;
        this.set({ phase: "installing", installOnQuit: false, error: undefined });
        try { this.driver.install(relaunch); } catch { this.installFailed(); }
        return true;
    }
    installFailed() {
        if (this.state.phase === "installing")
            this.set({ phase: "ready", installOnQuit: false, error: "Couldn’t install the update. You can retry or download an installer from Releases." });
    }
}
