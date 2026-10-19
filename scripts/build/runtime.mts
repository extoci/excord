import { build, type Plugin } from "esbuild";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeDependencyLicenses } from "./licenses.mts";
import { optimizePatcher } from "./optimizePatcher.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const vendor = join(root, "vendor/equicord");
const out = join(root, "static/runtime");
const lock = JSON.parse(await readFile(join(root, "upstream.lock.json"), "utf8"));
process.env.EQUICORD_HASH = lock.equicord.commit;
process.env.EQUICORD_REMOTE = "Equicord/Equicord";
process.argv.push("--standalone", "--disable-updater");
process.chdir(vendor);
// These upstream build plugins preserve CSS handling, plugin targets, and native APIs.
const upstream = await import(join(vendor, "scripts/build/common.mjs"));
await mkdir(out, { recursive: true });

const modules: Record<string, string> = {};
async function collect(directory: string) {
    for (const item of await readdir(join(vendor, "src", directory), { withFileTypes: true })) {
        const name = `${directory}/${item.name}`;
        if (item.isDirectory()) await collect(name);
        else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
            const key = `@${name.replace(/\.tsx?$/, "")}`;
            modules[key] = join(vendor, "src", name);
            if (key.endsWith("/index")) modules[key.slice(0, -6)] = modules[key];
        }
    }
}
for (const directory of ["api", "components", "utils", "shared", "webpack"]) await collect(directory);
modules["@webpack"] = join(vendor, "src/webpack/webpack.ts");
modules["@webpack/patcher"] = join(vendor, "src/webpack/patchWebpack.ts");
modules["~plugins"] = "~plugins";

const bridge: Plugin = {
    name: "excord-runtime",
    setup(ctx) {
        ctx.onLoad({ filter: /[/\\]src[/\\]webpack[/\\]patchWebpack\.ts$/ }, async ({ path }) => ({
            contents: optimizePatcher(await readFile(path, "utf8"), join(root, "src/excord/patchPrefilter.ts")),
            loader: "ts", resolveDir: dirname(path)
        }));
        ctx.onResolve({ filter: /^~excord-modules$/ }, () => ({ path: "modules", namespace: "excord" }));
        ctx.onLoad({ filter: /.*/, namespace: "excord" }, () => {
            const entries = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));
            return {
                contents: entries.map(([, path], i) => `import * as m${i} from ${JSON.stringify(path)};`).join("\n")
                    + `\nexport default {${entries.map(([key], i) => `${JSON.stringify(key)}:m${i}`).join(",")}};`,
                resolveDir: vendor
            };
        });
        ctx.onLoad({ filter: /[/\\]src[/\\]Vencord\.ts$/ }, async ({ path }) => ({
            contents: (await readFile(path, "utf8")).replace("initPluginManager();", "installExcordPlugins();\ninitPluginManager();")
                + `\nimport { installExcordPlugins } from ${JSON.stringify(join(root, "src/excord/runtime.ts"))};\n`,
            loader: "ts", resolveDir: dirname(path)
        }));
    }
};

const nativeModules: Record<string, string> = {};
for (const directory of ["main/utils", "shared"]) {
    for (const entry of await readdir(join(vendor, "src", directory))) {
        if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) nativeModules[`@${directory}/${entry.slice(0, -3)}`] = join(vendor, "src", directory, entry);
    }
}
for (const file of ["main/settings", "main/csp"]) nativeModules[`@${file}`] = join(vendor, "src", file);
const nativeBridge: Plugin = {
    name: "excord-native-api",
    setup(ctx) {
        ctx.onResolve({ filter: /^~excord-native-modules$/ }, () => ({ path: "native-modules", namespace: "excord-native-api" }));
        ctx.onLoad({ filter: /.*/, namespace: "excord-native-api" }, () => {
            const entries = Object.entries(nativeModules);
            return { contents: entries.map(([, path], index) => `import * as n${index} from ${JSON.stringify(path)};`).join("\n")
                + `\nexport default {${entries.map(([key], index) => `${JSON.stringify(key)}:n${index}`).join(",")}};`, resolveDir: vendor };
        });
        ctx.onLoad({ filter: /[/\\]src[/\\]main[/\\]index\.ts$/ }, async ({ path }) => ({
            contents: await readFile(path, "utf8") + '\nexport {default as modules} from "~excord-native-modules";\n', loader: "ts", resolveDir: dirname(path)
        }));
    }
};

const defines = {
    IS_STANDALONE: true, IS_DEV: false, IS_REPORTER: false, IS_COMPANION_TEST: false,
    IS_UPDATER_DISABLED: true, IS_ANTI_CRASH_TEST: false, IS_WEB: false,
    IS_EXTENSION: false, IS_USERSCRIPT: false, IS_DISCORD_DESKTOP: false,
    IS_VESKTOP: false, IS_EQUIBOP: true, VERSION: lock.equicord.version,
    BUILD_TIMESTAMP: Number(process.env.SOURCE_DATE_EPOCH ?? 0) * 1000
};
const define = Object.fromEntries(Object.entries(defines).map(([key, value]) => [key, JSON.stringify(value)]));
const common = { ...upstream.commonOpts, absWorkingDir: vendor, define, sourcemap: "external" as const, target: "es2022", metafile: true };

const natives: Plugin = {
    name: "excord-upstream-natives",
    setup(ctx) {
        ctx.onResolve({ filter: /^~pluginNatives$/ }, () => ({ path: "natives", namespace: "excord-native" }));
        ctx.onLoad({ filter: /.*/, namespace: "excord-native" }, async () => {
            const imports: string[] = [];
            const entries: string[] = [];
            for (const directory of ["plugins", "equicordplugins"]) {
                for (const entry of await readdir(join(vendor, "src", directory), { withFileTypes: true })) {
                    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
                    for (const suffix of ["native.ts", "native/index.ts"]) {
                        const path = join(vendor, "src", directory, entry.name, suffix);
                        try { await readFile(path); } catch { continue; }
                        const name = await upstream.resolvePluginName(join(vendor, "src", directory), entry);
                        const id = `n${imports.length}`;
                        imports.push(`import * as ${id} from ${JSON.stringify(path)};`);
                        entries.push(`${JSON.stringify(name)}:${id}`);
                        break;
                    }
                }
            }
            return { contents: imports.join("\n") + `\nexport default {${entries.join(",")}};`, resolveDir: vendor };
        });
    }
};

const main = await build({ ...common, entryPoints: ["src/main/index.ts"], outfile: join(out, "main.js"),
    platform: "node", format: "cjs", external: ["electron", "original-fs", "/assets/*"],
    plugins: [nativeBridge, natives, ...upstream.commonOpts.plugins] });
const preload = await build({ ...common, entryPoints: ["src/preload.ts"], outfile: join(out, "preload.js"),
    platform: "node", format: "cjs", external: ["electron", "electron/renderer", "original-fs", "/assets/*"] });
const rendererOptions = { ...common, entryPoints: ["src/Vencord.ts"], outfile: join(out, "renderer.js"),
    format: "iife", globalName: "Vencord", metafile: true,
    plugins: [bridge, upstream.globPlugins("equibop"), ...upstream.commonRendererPlugins] } as const;
const baseline = await build({ ...rendererOptions, write: false, logLevel: "silent" });
// Expose plugin helpers that already belong to this target's renderer graph.
// This avoids importing desktop-only or native modules into the website.
for (const path of Object.keys(baseline.metafile!.inputs)) {
    const source = path.replaceAll("\\", "/");
    if (!/^src\/(plugins|equicordplugins|debug)\/.+\.tsx?$/.test(source) || source.endsWith(".d.ts")) continue;
    const key = `@${source.slice(4).replace(/\.tsx?$/, "")}`;
    modules[key] = join(vendor, path);
    if (key.endsWith("/index")) modules[key.slice(0, -6)] = modules[key];
}
const renderer = await build(rendererOptions);
await writeDependencyLicenses([main.metafile!, preload.metafile!, renderer.metafile!], vendor, join(out, "THIRD_PARTY_LICENSES.txt"));
await writeFile(join(out, "modules.json"), JSON.stringify({ aliases: Object.keys(modules), nativeAliases: Object.keys(nativeModules), defines, revision: lock.equicord.commit }, null, 2));
await writeFile(join(out, "bundle-report.json"), JSON.stringify({ revision: lock.equicord.commit,
    outputs: Object.fromEntries(Object.entries(renderer.metafile!.outputs).map(([path, value]) => [relative(vendor, path), { bytes: value.bytes }])) }, null, 2));
process.chdir(root);
