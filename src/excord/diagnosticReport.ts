import type { PerformanceSnapshot } from "./types";

export function createDiagnosticReport(snapshot: PerformanceSnapshot, build: {
    version: string; revision: string; electron: string; chromium: string; platform: string; architecture: string;
    osRelease: string; safeMode: boolean; packaged: boolean;
}, events: readonly { kind: string; code: number }[]) {
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        build: { version: build.version, revision: build.revision, electron: build.electron, chromium: build.chromium,
            platform: build.platform, architecture: build.architecture, osRelease: build.osRelease,
            safeMode: build.safeMode, packaged: build.packaged },
        upstream: { version: snapshot.upstream.version, commit: snapshot.upstream.commit },
        startupMs: snapshot.startupMs,
        uptimeSeconds: snapshot.uptimeSeconds,
        processes: snapshot.processes.map(item => ({ type: item.type, cpuPercent: item.cpuPercent, memoryMiB: item.memoryMiB })),
        localPlugins: {
            prepared: snapshot.localPlugins.plugins.length,
            cached: snapshot.localPlugins.plugins.filter(plugin => plugin.cacheHit).length,
            native: snapshot.localPlugins.plugins.filter(plugin => plugin.nativePath).length,
            preparationMs: snapshot.localPlugins.durationMs,
            issues: { compile: snapshot.localPlugins.issues.filter(issue => issue.phase === "compile").length,
                native: snapshot.localPlugins.issues.filter(issue => issue.phase === "native").length,
                load: snapshot.localPlugins.issues.filter(issue => issue.phase === "load").length }
        },
        events: events.map(event => ({ kind: event.kind, code: event.code })),
        updates: "manual closed alpha",
        privacy: "No cookies, account identifiers, URLs, filesystem paths, settings contents, plugin source, or raw error messages are collected."
    };
}
