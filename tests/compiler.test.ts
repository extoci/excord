import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { createLocalPlugin, LocalPluginCompiler } from "../src/excord/compiler";
import { isDiscordOrigin } from "../src/excord/origin";
import type { RuntimeModuleManifest } from "../src/excord/types";

const temporary: string[] = [];
const manifest: RuntimeModuleManifest = {
    revision: "test-revision", aliases: ["@utils/types", "@api/Settings", "@api/Styles", "@webpack/common"],
    defines: { IS_WEB: false, IS_EQUIBOP: true }
};

async function setup() {
    const root = await mkdtemp(join(tmpdir(), "excord-compiler-")); temporary.push(root);
    const plugins = join(root, "plugins"); await mkdir(plugins);
    return { root, plugins, compiler: new LocalPluginCompiler(plugins, join(root, "cache"), manifest) };
}

function evaluate(code: string, extra: Record<string, unknown> = {}) {
    return runInNewContext(code + ";ExcordLocalPlugin.default", {
        ExcordModules: { "@utils/types": { default: (value: unknown) => value }, "@webpack/common": { React: { createElement: (...args: unknown[]) => args } } },
        ...extra
    });
}

afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("local plugin compilation", () => {
    test("compiles a created Vencord plugin and reuses its cache", async () => {
        const { plugins, compiler } = await setup();
        await createLocalPlugin(plugins, "my-plugin");
        const first = await compiler.prepare();
        expect(first.issues).toEqual([]);
        expect(first.plugins).toHaveLength(1);
        const plugin = evaluate(first.plugins[0].code);
        expect(plugin.name).toBe("my-plugin");
        expect(typeof plugin.start).toBe("function");
        expect(first.plugins[0].cacheHit).toBe(false);
        expect((await compiler.prepare()).plugins[0].cacheHit).toBe(true);
    });

    test("refresh detects edits to helper files and removed plugins", async () => {
        const { plugins, compiler } = await setup();
        const path = await createLocalPlugin(plugins, "my-plugin");
        await writeFile(join(path, "index.ts"), 'import { name } from "./helper"; export default { name };');
        await writeFile(join(path, "helper.ts"), 'export const name = "before";');
        expect(evaluate((await compiler.prepare()).plugins[0].code).name).toBe("before");
        await writeFile(join(path, "helper.ts"), 'export const name = "after";');
        const changed = await compiler.prepare();
        expect(changed.plugins[0].cacheHit).toBe(false);
        expect(evaluate(changed.plugins[0].code).name).toBe("after");
        await rm(path, { recursive: true });
        expect((await compiler.prepare()).plugins).toEqual([]);
    });

    test("a broken plugin does not block another folder or run stale code", async () => {
        const { plugins, compiler } = await setup();
        const broken = await createLocalPlugin(plugins, "broken");
        await createLocalPlugin(plugins, "healthy");
        expect((await compiler.prepare()).plugins).toHaveLength(2);
        await writeFile(join(broken, "index.ts"), "export default definePlugin({ broken !!!");
        const snapshot = await compiler.prepare();
        expect(snapshot.plugins.map(plugin => plugin.folder)).toEqual(["healthy"]);
        expect(snapshot.issues[0].folder).toBe("broken");
        expect(snapshot.issues[0].phase).toBe("compile");
    });

    test("keeps live references to the host API rather than duplicating its settings", async () => {
        const { plugins, compiler } = await setup();
        const directory = await createLocalPlugin(plugins, "shared-api");
        await writeFile(join(directory, "index.ts"), 'import { Settings } from "@api/Settings"; export default { start() { Settings.plugins.shared.enabled = true; } };');
        const settings = { plugins: { shared: { enabled: false } } };
        const plugin = evaluate((await compiler.prepare()).plugins[0].code, { ExcordModules: { "@api/Settings": { Settings: settings } } });
        plugin.start();
        expect(settings.plugins.shared.enabled).toBe(true);
    });

    test("compiles native.ts with the matching plugin identity", async () => {
        const { plugins, compiler } = await setup();
        const directory = await createLocalPlugin(plugins, "native-plugin");
        await writeFile(join(directory, "native.ts"), 'import { basename } from "node:path"; export function echo(_event: unknown, path: string) { return basename(path); }');
        const snapshot = await compiler.prepare();
        expect(snapshot.issues).toEqual([]);
        expect(snapshot.plugins[0].nativePluginName).toBe("native-plugin");
        const module = { exports: {} as Record<string, (event: unknown, path: string) => string> };
        runInNewContext(await readFile(snapshot.plugins[0].nativePath!, "utf8"), { module, exports: module.exports, require });
        expect(module.exports.echo(null, "/some/file.txt")).toBe("file.txt");
    });

    test("supports managed CSS and JSX without importing another React", async () => {
        const { plugins, compiler } = await setup();
        const directory = await createLocalPlugin(plugins, "styled-plugin");
        await rm(join(directory, "index.ts"));
        await writeFile(join(directory, "index.tsx"), 'import style from "./style.css?managed";export default { managedStyle: style, render() { return <div>hello</div>; } };');
        await writeFile(join(directory, "style.css"), ".local{color:red}");
        const styles = new Map();
        const plugin = evaluate((await compiler.prepare()).plugins[0].code, { ExcordModules: { "@api/Styles": { styleMap: styles }, "@webpack/common": { React: { createElement: (...args: unknown[]) => args } } } });
        expect(styles.get(plugin.managedStyle).source).toBe(".local{color:red}");
        expect(plugin.render()).toEqual(["div", null, "hello"]);
    });

    test("reports unavailable host imports", async () => {
        const { plugins, compiler } = await setup();
        const directory = await createLocalPlugin(plugins, "unknown-api");
        await writeFile(join(directory, "index.ts"), 'import { x } from "@api/DoesNotExist"; export default x;');
        const snapshot = await compiler.prepare();
        expect(snapshot.plugins).toEqual([]);
        expect(snapshot.issues[0].message).toContain("does not export @api/DoesNotExist");
    });

    test("does not overwrite an existing folder or traverse outside the plugin directory", async () => {
        const { plugins } = await setup();
        const directory = await createLocalPlugin(plugins, "existing");
        const original = await readFile(join(directory, "index.ts"), "utf8");
        await expect(createLocalPlugin(plugins, "existing")).rejects.toThrow();
        expect(await readFile(join(directory, "index.ts"), "utf8")).toBe(original);
        for (const name of ["../outside", "A", "a/b", "a\\b", "", "a".repeat(65)]) {
            await expect(createLocalPlugin(plugins, name)).rejects.toThrow();
        }
    });

    test("reports symlinked folders and deduplicates concurrent refreshes", async () => {
        const { root, plugins, compiler } = await setup();
        await createLocalPlugin(plugins, "real");
        await symlink(join(root, "plugins/real"), join(plugins, "linked"), "dir");
        const first = compiler.prepare();
        expect(compiler.prepare()).toBe(first);
        const result = await first;
        expect(result.plugins).toHaveLength(1);
        expect(result.issues[0].folder).toBe("linked");
    });

    test("reads file imports and invalidates a file outside the plugin folder", async () => {
        const { root, plugins, compiler } = await setup();
        const directory = await createLocalPlugin(plugins, "raw-files");
        await writeFile(join(root, "shared.txt"), "first\n");
        await writeFile(join(directory, "index.ts"), 'import text from "file://../../shared.txt"; export default { text };');
        expect(evaluate((await compiler.prepare()).plugins[0].code).text).toBe("first");
        await writeFile(join(root, "shared.txt"), "second\n");
        const second = await compiler.prepare();
        expect(evaluate(second.plugins[0].code).text).toBe("second");
        expect(second.plugins[0].cacheHit).toBe(false);
    });

    test("rebuilds native dependencies outside a plugin folder", async () => {
        const { root, plugins, compiler } = await setup();
        const directory = await createLocalPlugin(plugins, "native-shared");
        await writeFile(join(root, "native-helper.ts"), 'export const value = "before";');
        await writeFile(join(directory, "native.ts"), 'export { value } from "../../native-helper";');
        const first = await compiler.prepare();
        expect(first.issues).toEqual([]);
        const before = await readFile(first.plugins[0].nativePath!, "utf8");
        await writeFile(join(root, "native-helper.ts"), 'export const value = "after";');
        const second = await compiler.prepare();
        expect(second.plugins[0].cacheHit).toBe(false);
        expect(await readFile(second.plugins[0].nativePath!, "utf8")).not.toBe(before);
    });

    test("removes obsolete compiled artifacts rather than growing the cache on every edit", async () => {
        const { root, plugins, compiler } = await setup();
        const directory = await createLocalPlugin(plugins, "cache-cleanup");
        await compiler.prepare();
        expect(await readdir(join(root, "cache"))).toHaveLength(1);
        await writeFile(join(directory, "helper.txt"), "changed");
        await compiler.prepare();
        expect(await readdir(join(root, "cache"))).toHaveLength(1);
        await rm(directory, { recursive: true });
        await compiler.prepare();
        expect(await readdir(join(root, "cache"))).toEqual([]);
    });

    test("rejects oversized source files before loading them into memory", async () => {
        const { plugins, compiler } = await setup();
        const directory = await createLocalPlugin(plugins, "large-file");
        const asset = join(directory, "large.bin");
        await writeFile(asset, "");
        await truncate(asset, 33 * 1024 * 1024);
        const result = await compiler.prepare();
        expect(result.plugins).toEqual([]);
        expect(result.issues[0].message).toContain("32 MiB");
    });
});

test("privileged IPC accepts only exact Discord HTTPS origins", () => {
    for (const value of ["https://discord.com/app", "https://canary.discord.com/channels/@me", "https://ptb.discord.com/login"]) expect(isDiscordOrigin(value)).toBe(true);
    for (const value of ["http://discord.com", "https://discord.com.evil.test", "https://evil.test/discord.com", "https://discord.com:8080", "https://user@discord.com", "file:///tmp/discord.com", "about:blank", "not a URL"]) expect(isDiscordOrigin(value)).toBe(false);
});
