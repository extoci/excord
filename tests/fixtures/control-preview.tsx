import { createRoot } from "react-dom/client";

import { ControlCenter } from "../../src/excord/ControlCenter";
import type { ExcordNativeApi, PerformanceSnapshot } from "../../src/excord/types";

const diagnostics: PerformanceSnapshot = {
    startupMs: 1840, uptimeSeconds: 140,
    processes: [{ type: "Browser", cpuPercent: 0.2, memoryMiB: 85 }, { type: "Tab", cpuPercent: 1.2, memoryMiB: 230 }, { type: "GPU", cpuPercent: 0.1, memoryMiB: 72 }],
    upstream: { version: "1.15.11.0", commit: "e0e85c8d4f6dc73aac9368cf3f4b2200eac4d4b4" },
    localPlugins: { plugins: [], issues: [], preparedAt: "2026-10-18T21:30:00Z", durationMs: 12 }
};
const native: ExcordNativeApi = {
    getLocalPlugins: () => diagnostics.localPlugins,
    reportIssues: () => {},
    openPluginsFolder: async () => {},
    createPlugin: async name => { diagnostics.localPlugins.plugins.push({ folder: name, code: "", cacheHit: false, durationMs: 10 }); return `/preview/plugins/${name}`; },
    refresh: async () => { window.location.reload(); },
    diagnostics: async () => diagnostics,
    openSettings: async () => {},
    exportDiagnostics: async () => false
};
globalThis.ExcordNative = native;
globalThis.VesktopNative = { app: { getVersion: () => "0.1.0" } } as typeof VesktopNative;
createRoot(document.getElementById("root")!).render(<main><ControlCenter /></main>);
