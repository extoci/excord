import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { BuildOptions, Plugin } from "esbuild";

import type { LocalPluginSnapshot, PluginBuild, RuntimeModuleManifest } from "./types";

const ignored = new Set([".git", "node_modules", "dist", ".DS_Store"]);
const maximumBytes = 32 * 1024 * 1024;
const maximumFiles = 2000;

export async function fingerprintFolder(folder: string): Promise<string> {
    const hash = createHash("sha256");
    let bytes = 0;
    let count = 0;
    async function visit(directory: string) {
        const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (ignored.has(entry.name)) continue;
            const path = join(directory, entry.name);
            if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in plugin folders: ${relative(folder, path)}`);
            if (entry.isDirectory()) await visit(path);
            else if (entry.isFile()) {
                if (++count > maximumFiles) throw new Error(`A plugin folder can contain at most ${maximumFiles} source files.`);
                const contents = await readFile(path);
                bytes += contents.length;
                if (bytes > maximumBytes) throw new Error("A plugin folder can contain at most 32 MiB of source files.");
                hash.update(relative(folder, path)).update("\0").update(contents).update("\0");
            }
        }
    }
    await visit(folder);
    return hash.digest("hex");
}

function moduleBridge(aliases: string[]): Plugin {
    const available = new Set(aliases);
    return {
        name: "excord-shared-api",
        setup(build) {
            build.onResolve({ filter: /^(?:@(?:api|utils|webpack|components|shared)(?:\/|$)|~plugins$)/ }, args => {
                let key = args.path.replace(/\.tsx?$/, "");
                if (!available.has(key) && available.has(`${key}/index`)) key += "/index";
                if (!available.has(key)) return { errors: [{ text: `The bundled Equicord revision does not export ${args.path}.` }] };
                return { path: key, namespace: "excord-api" };
            });
            build.onLoad({ filter: /.*/, namespace: "excord-api" }, ({ path }) => ({
                contents: `const host=globalThis.ExcordModules[${JSON.stringify(path)}];Object.defineProperty(exports,"__esModule",{value:true});for(const key of Object.keys(host)){if(key!=="__esModule")Object.defineProperty(exports,key,{enumerable:true,get:()=>host[key]});}`
            }));
        }
    };
}

async function optionalRead(path: string): Promise<string | undefined> {
    try { return await readFile(path, "utf8"); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
    }
}

async function atomicWrite(path: string, value: string) {
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, value);
    await rename(temporary, path);
}

export class LocalPluginCompiler {
    private pending: Promise<LocalPluginSnapshot> | undefined;

    constructor(
        readonly pluginsDirectory: string,
        private readonly cacheDirectory: string,
        private readonly manifest: RuntimeModuleManifest
    ) {}

    prepare(): Promise<LocalPluginSnapshot> {
        return this.pending ??= this.compileAll().finally(() => { this.pending = undefined; });
    }

    private async compileAll(): Promise<LocalPluginSnapshot> {
        const started = performance.now();
        const snapshot: LocalPluginSnapshot = { plugins: [], issues: [], preparedAt: new Date().toISOString(), durationMs: 0 };
        await mkdir(this.pluginsDirectory, { recursive: true });
        await mkdir(this.cacheDirectory, { recursive: true });
        const entries = (await readdir(this.pluginsDirectory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (entry.name.startsWith(".")) continue;
            if (entry.isSymbolicLink()) {
                snapshot.issues.push({ folder: entry.name, phase: "compile", message: "Use a real plugin folder rather than a symbolic link." });
                continue;
            }
            if (!entry.isDirectory()) continue;
            try {
                snapshot.plugins.push(await this.compilePlugin(entry.name));
            } catch (error) {
                snapshot.issues.push({ folder: entry.name, phase: "compile", message: error instanceof Error ? error.message : String(error) });
            }
        }
        snapshot.durationMs = performance.now() - started;
        return snapshot;
    }

    private async compilePlugin(folder: string): Promise<PluginBuild> {
        const started = performance.now();
        const directory = join(this.pluginsDirectory, folder);
        const entry = await optionalRead(join(directory, "index.ts")) !== undefined ? "index.ts" : "index.tsx";
        if (await optionalRead(join(directory, entry)) === undefined) throw new Error("This folder needs an index.ts or index.tsx file.");
        const fingerprint = await fingerprintFolder(directory);
        const identity = createHash("sha256").update(directory).update(fingerprint).update(this.manifest.revision).update(JSON.stringify(this.manifest)).update("excord-compiler-v2").digest("hex");
        const cache = join(this.cacheDirectory, identity);
        const rendererPath = `${cache}.js`;
        const nativePath = `${cache}.cjs`;
        const cached = await optionalRead(rendererPath);
        const hasNative = await optionalRead(join(directory, "native.ts")) !== undefined;
        const hasNativeIndex = !hasNative && await optionalRead(join(directory, "native/index.ts")) !== undefined;
        const nativeEntry = hasNative ? join(directory, "native.ts") : hasNativeIndex ? join(directory, "native/index.ts") : undefined;
        const source = (await optionalRead(join(directory, entry)))!;
        const nativePluginName = nativeEntry ? /definePlugin\(\{\s*(?:["']?name["']?)\s*:\s*(["'`])([^\n]+?)\1/.exec(source)?.[2] : undefined;
        if (nativeEntry && !nativePluginName) throw new Error("Plugins with native.ts need a literal name as the first property in definePlugin, like upstream Equicord plugins.");
        if (cached !== undefined && (!nativeEntry || await optionalRead(nativePath) !== undefined)) {
            return { folder, code: cached, cacheHit: true, durationMs: performance.now() - started, ...(nativeEntry ? { nativePath, nativePluginName } : {}) };
        }

        // Loading the compiler and its native executable is deferred until a plugin actually changes.
        const { build } = await import("esbuild");
        const sourceRoot = resolve(directory);
        const styles: Plugin = {
            name: "excord-local-styles",
            setup(ctx) {
                ctx.onResolve({ filter: /\.css(?:\?managed)?$/ }, args => ({ path: resolve(args.resolveDir, args.path.replace(/\?managed$/, "")), namespace: "excord-style", pluginData: args.path.endsWith("?managed") }));
                ctx.onLoad({ filter: /.*/, namespace: "excord-style" }, async ({ path, pluginData: managed }) => {
                    const css = await readFile(path, "utf8");
                    const name = `excord-local/${folder}/${relative(sourceRoot, path).replaceAll("\\", "/")}`;
                    return { contents: managed
                        ? `globalThis.ExcordModules["@api/Styles"].styleMap.set(${JSON.stringify(name)},{name:${JSON.stringify(name)},source:${JSON.stringify(css)},classNames:{},dom:null});export default ${JSON.stringify(name)};`
                        : `const style=document.createElement("style");style.textContent=${JSON.stringify(css)};if(document.documentElement)document.documentElement.append(style);else document.addEventListener("DOMContentLoaded",()=>document.documentElement.append(style),{once:true});`, loader: "js" };
                });
            }
        };
        const options: BuildOptions = {
            absWorkingDir: directory, bundle: true, write: false, minify: true,
            sourcemap: "inline", target: "es2022", logLevel: "silent",
            define: Object.fromEntries(Object.entries(this.manifest.defines).map(([key, value]) => [key, JSON.stringify(value)])),
            jsx: "transform", jsxFactory: "ExcordReact.createElement", jsxFragment: "ExcordReact.Fragment",
            plugins: [moduleBridge(this.manifest.aliases), styles],
            banner: { js: 'const ExcordReact = new Proxy({}, {get: (_, key) => globalThis.ExcordModules["@webpack/common"].React[key]});' }
        };
        const renderer = await build({ ...options, entryPoints: [join(directory, entry)], format: "iife", globalName: "ExcordLocalPlugin", metafile: true });
        // A cached plugin may depend on installed packages. Rebuild it on refresh so package edits are never stale.
        const hasExternalInputs = Object.keys(renderer.metafile!.inputs).some(path => {
            if (path.startsWith("excord-")) return false;
            const rel = relative(sourceRoot, resolve(directory, path));
            return rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel) || path.includes("node_modules");
        });
        const code = renderer.outputFiles![0].text;
        if (nativeEntry) {
            const native = await build({ ...options, entryPoints: [nativeEntry], platform: "node", format: "cjs",
                plugins: [], banner: undefined, external: ["electron", "original-fs"], jsx: "automatic" });
            await atomicWrite(nativePath, native.outputFiles![0].text);
        }
        if (hasExternalInputs) await rm(rendererPath, { force: true });
        else await atomicWrite(rendererPath, code);
        return { folder, code, cacheHit: false, durationMs: performance.now() - started, ...(nativeEntry ? { nativePath, nativePluginName } : {}) };
    }
}

export function validatePluginFolderName(name: string): string {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw new Error("Use 1 to 64 lowercase letters, numbers, or hyphens, beginning with a letter.");
    return name;
}

export async function createLocalPlugin(directory: string, name: string): Promise<string> {
    validatePluginFolderName(name);
    const target = join(directory, name);
    await mkdir(dirname(target), { recursive: true });
    await mkdir(target);
    await writeFile(join(target, "index.ts"), `import definePlugin from "@utils/types";\n\nexport default definePlugin({\n    name: ${JSON.stringify(name)},\n    description: "My personal Excord plugin",\n    authors: [{ name: "Me", id: 0n }],\n    enabledByDefault: true,\n    start() {\n        console.log("[${name}] Plugin started");\n    },\n    stop() {\n        console.log("[${name}] Plugin stopped");\n    }\n});\n`, { flag: "wx" });
    await writeFile(join(target, "README.md"), `# ${name}\n\nEdit index.ts, then press Cmd+R or Ctrl+R in Excord.\nUse the Vencord and Equicord plugin APIs. Excord compiles this folder locally.\n`, { flag: "wx" });
    return target;
}
