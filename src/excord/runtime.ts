import modules from "~excord-modules";

import type { PluginIssue } from "./types";
import { createEfficiencyPlugin } from "./efficiency";

interface PluginDefinition {
    name: string;
    description: string;
    authors: unknown[];
    enabledByDefault?: boolean;
}

export function installExcordPlugins() {
    globalThis.ExcordModules = modules;
    const registry = modules["~plugins"] as {
        default: Record<string, PluginDefinition>;
        PluginMeta: Record<string, { folderName: string; userPlugin: boolean }>;
    };
    registry.default.ExcordEfficiency = createEfficiencyPlugin(modules);
    registry.PluginMeta.ExcordEfficiency = { folderName: "excord/efficiency", userPlugin: false };
    const issues: PluginIssue[] = [];
    for (const plugin of ExcordNative.getLocalPlugins().plugins) {
        try {
            const exports: unknown = new Function(`${plugin.code}\n;return ExcordLocalPlugin;`)();
            const definition = (exports as { default?: PluginDefinition })?.default;
            if (!definition || typeof definition.name !== "string" || !definition.name.trim()
                || typeof definition.description !== "string" || !Array.isArray(definition.authors)) {
                throw new Error("Export default definePlugin({ name, description, authors, ... }) from index.ts.");
            }
            if (Object.hasOwn(registry.default, definition.name)) {
                throw new Error(`A plugin named ${definition.name} already exists. Choose a different name.`);
            }
            definition.enabledByDefault ??= true;
            registry.default[definition.name] = definition;
            registry.PluginMeta[definition.name] = { folderName: `local/${plugin.folder}`, userPlugin: true };
        } catch (error) {
            issues.push({ folder: plugin.folder, phase: "load", message: error instanceof Error ? error.message : String(error) });
            console.error(`[Excord] Could not load ${plugin.folder}`, error);
        }
    }
    if (issues.length) ExcordNative.reportIssues(issues);
}
