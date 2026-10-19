export interface PluginBuild {
    folder: string;
    code: string;
    nativePath?: string;
    nativePluginName?: string;
    cacheHit: boolean;
    durationMs: number;
}

export interface PluginIssue {
    folder: string;
    message: string;
    phase: "compile" | "load" | "native";
}

export interface LocalPluginSnapshot {
    plugins: PluginBuild[];
    issues: PluginIssue[];
    preparedAt: string;
    durationMs: number;
}

export interface PerformanceSnapshot {
    startupMs: number | null;
    uptimeSeconds: number;
    processes: Array<{ type: string; cpuPercent: number; memoryMiB: number }>;
    localPlugins: LocalPluginSnapshot;
    upstream: { commit: string; version: string };
}

export interface RuntimeModuleManifest {
    aliases: string[];
    nativeAliases?: string[];
    defines: Record<string, string | number | boolean>;
    revision: string;
}

export interface ExcordNativeApi {
    setRealtimeActivity(active: boolean): void;
    getLocalPlugins(): LocalPluginSnapshot;
    reportIssues(issues: PluginIssue[]): void;
    openPluginsFolder(): Promise<void>;
    createPlugin(name: string): Promise<string>;
    refresh(): Promise<void>;
    diagnostics(): Promise<PerformanceSnapshot>;
    openSettings(): Promise<void>;
    exportDiagnostics(): Promise<boolean>;
}
