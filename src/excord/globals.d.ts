import type { ExcordNativeApi } from "./types";

declare global {
    var ExcordNative: ExcordNativeApi;
    var ExcordModules: Record<string, unknown>;
}

export {};
