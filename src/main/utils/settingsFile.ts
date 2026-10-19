import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function readSettingsFile(file: string): Record<string, unknown> {
    if (!existsSync(file)) return {};
    const text = readFileSync(file, "utf8");
    try {
        const value: unknown = JSON.parse(text);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a settings object");
        return value as Record<string, unknown>;
    } catch {
        // Preserve the original before a subsequent settings change writes defaults.
        copyFileSync(file, `${file}.invalid-${Date.now()}-${process.pid}.bak`);
        console.warn("[Excord] Invalid settings preserved in a .bak file; using defaults.");
        return {};
    }
}

export function writeSettingsFile(file: string, value: object) {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    try {
        writeFileSync(temporary, JSON.stringify(value, null, 4), { mode: 0o600 });
        renameSync(temporary, file);
    } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
    }
}

export function backupSettingsForReset(directory: string): string {
    const backup = join(directory, "backups", `reset-${Date.now()}-${process.pid}`);
    mkdirSync(backup, { recursive: true });
    for (const file of ["settings.json", "state.json", "settings/settings.json", "settings/native-settings.json", "settings/quickCss.css"]) {
        const source = join(directory, file);
        if (!existsSync(source)) continue;
        const destination = join(backup, file);
        mkdirSync(dirname(destination), { recursive: true });
        renameSync(source, destination);
    }
    return backup;
}
