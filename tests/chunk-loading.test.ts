import { expect, test } from "bun:test";
import { transformSync } from "esbuild";
import { readFileSync } from "node:fs";

import { normalizeChunkIds } from "../scripts/build/normalizeChunkIds.mts";
import { guildSidebarChunks } from "../src/excord/favorites/native";

const source = readFileSync(new URL("../vendor/equicord/src/webpack/webpack.ts", import.meta.url), "utf8");
const canonical = (regex: RegExp) => new RegExp(regex.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));

async function load(runtime: string, quoted: boolean, named = false) {
    // Execute the real upstream loader, including its chunk ID extraction.
    const start = runtime.indexOf("export const DefaultExtractAndLoadChunksRegex");
    const end = runtime.indexOf("/**", runtime.indexOf("export function extractAndLoadChunksLazy"));
    const code = transformSync(runtime.slice(start, end), { loader: "ts", format: "cjs" }).code;
    const requested: Array<string | number> = [];
    let executed = false;
    const requireEntry = Object.assign(() => { executed = true; }, {
        m: {} as Record<string, unknown>,
        async e(id: string | number) {
            // Current Discord's URL resolver uses strict numeric comparisons.
            if (named ? id !== "chunk-3" && id !== "chunk-4" : id !== 3 && id !== 4)
                throw new Error("Chunks must retain their ID type");
            requested.push(id);
            if (requested.length === 2) requireEntry.m["5"] = () => {};
        }
    });
    const id = (value: number) => named ? `"chunk-${value}"` : quoted ? `"${value}"` : String(value);
    const factory = `createPromise:()=>Promise.all([n.e(${id(3)}),n.e(${id(4)})]).then(n.bind(n,5)),webpackId:5,name:"GuildSidebar"`;
    const module = { exports: {} as { extractAndLoadChunks(code: string[], matcher: RegExp): Promise<boolean> } };
    new Function("module", "canonicalizeMatch", "findModuleFactory", "wreq", "logger", "IS_ANTI_CRASH_TEST", "IS_DEV", "devToolsOpen", code)(
        module, canonical, () => factory, requireEntry, { warn() {} }, false, false, false
    );
    const loaded = await module.exports.extractAndLoadChunks(['name:"GuildSidebar"'], guildSidebarChunks);
    return { loaded, requested, executed };
}

test("the pinned loader loads numeric Discord chunk IDs before requiring the guild sidebar", async () => {
    expect(await load(normalizeChunkIds(source), false)).toEqual({ loaded: true, requested: [3, 4], executed: true });
});

test("the pinned loader retains support for quoted chunk IDs", async () => {
    expect(await load(normalizeChunkIds(source), true)).toEqual({ loaded: true, requested: [3, 4], executed: true });
});

test("the pinned loader retains nonnumeric chunk names", async () => {
    expect(await load(normalizeChunkIds(source), true, true)).toEqual({ loaded: true, requested: ["chunk-3", "chunk-4"], executed: true });
});

test("the chunk loader transformation requires review when upstream changes", () => {
    expect(() => normalizeChunkIds(source.replace("export const ChunkIdsRegex", "export const OtherRegex"))).toThrow("chunk loader changed");
    expect(() => normalizeChunkIds(source.replace("String(numChunkId)", "numChunkId"))).toThrow("chunk loader changed");
});
