import type { Metafile } from "esbuild";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Carry installed dependency notices into bundles whose original packages do not ship. */
export async function writeDependencyLicenses(metafiles: Metafile[], baseDirectory: string, output: string) {
    const roots = new Set<string>();
    for (const metafile of metafiles) {
        for (const input of Object.keys(metafile.inputs)) {
            const path = resolve(baseDirectory, input).replaceAll("\\", "/");
            const start = path.lastIndexOf("/node_modules/");
            if (start < 0) continue;
            const parts = path.slice(start + "/node_modules/".length).split("/");
            roots.add(path.slice(0, start) + "/node_modules/" + parts.slice(0, parts[0].startsWith("@") ? 2 : 1).join("/"));
        }
    }
    const sections = new Map<string, string>();
    for (const root of roots) {
        let metadata: { name: string; version: string; license?: unknown };
        try { metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8")); }
        catch { continue; } // Virtual build inputs may not correspond to a filesystem package.
        const name = `${metadata.name}@${metadata.version}`;
        const files = (await readdir(root)).filter(file => /^(licen[cs]e|copying|copyright|notice)([.\-_]|$)/i.test(file)).sort();
        const notices: string[] = [];
        for (const file of files) {
            const text = await readFile(join(root, file), "utf8").catch(() => undefined);
            if (text) notices.push(`${file}\n\n${text}`);
        }
        sections.set(name, `${name}\nLicense metadata: ${JSON.stringify(metadata.license ?? "unspecified")}\n\n${notices.join("\n\n")}`);
    }
    await writeFile(output, "Dependency notices collected from installed packages used by this bundle.\n"
        + "Package metadata is recorded when no root license file is present.\n\n"
        + [...sections].sort(([a], [b]) => a.localeCompare(b)).map(([, text]) => text).join("\n\n========================================\n\n"));
}
