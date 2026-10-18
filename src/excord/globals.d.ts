import type { ExcordNativeApi } from "./types";

declare global {
    var ExcordNative: ExcordNativeApi;
    var ExcordModules: Record<string, unknown>;
    var ExcordNativeModules: Record<string, unknown>;
}

export {};
