import { expect, test } from "bun:test";
import { transform } from "esbuild";
import { readFile } from "node:fs/promises";

import { supportNumericChunkIds } from "../scripts/build/chunkIds.mts";
import { guildSidebarChunks } from "../src/excord/favorites/native";

const canonical = (regex: RegExp) => new RegExp(regex.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));

for (const quoted of [true, false]) test(`the bundled chunk loader loads ${quoted ? "quoted" : "numeric"} Discord chunk IDs before requiring the sidebar`, async () => {
    const source = supportNumericChunkIds(await readFile("vendor/equicord/src/webpack/webpack.ts", "utf8"));
    const chunkRegex = source.match(/^export const ChunkIdsRegex = (.+);$/m)![1];
    const loader = source.slice(source.indexOf("export async function extractAndLoadChunks("), source.indexOf("/**", source.indexOf("export async function extractAndLoadChunks(")));
    const loaded: Array<string | number> = [];
    let required = false;
    const wreq = Object.assign((id: string) => { expect(id).toBe("260269"); required = true; }, {
        m: {} as Record<string, unknown>,
        async e(id: string | number) { loaded.push(id); if (loaded.length === 3) wreq.m["260269"] = () => {}; }
    });
    const id = (value: number) => quoted ? JSON.stringify(String(value)) : String(value);
    // Discord's November 6 payload uses unquoted numeric IDs in GuildSidebar.
    const factory = `createPromise:()=>Promise.all([n.e(${id(102247)}),n.e(${id(983373)}),n.e(${quoted ? id(592000) : "592e3"})]).then(n.bind(n,260269)),webpackId:260269,name:"GuildSidebar"`;
    const loaderJs = (await transform(loader.replace("export async function", "async function"), { loader: "ts" })).code;
    const run = new Function("wreq", "findModuleFactory", "canonicalizeMatch", "logger", `
        const IS_ANTI_CRASH_TEST = false, IS_DEV = false;
        const ChunkIdsRegex = ${chunkRegex};
        ${loaderJs}
        return extractAndLoadChunks;
    `)(wreq, () => factory, canonical, { warn() {} });
    expect(await run(['name:"GuildSidebar"'], guildSidebarChunks)).toBe(true);
    expect(loaded).toEqual(quoted ? ["102247", "983373", "592000"] : [102247, 983373, 592000]);
    expect(required).toBe(true);
});

test("the chunk loader transform rejects upstream drift and accepts Windows newlines", async () => {
    const source = await readFile("vendor/equicord/src/webpack/webpack.ts", "utf8");
    expect(() => supportNumericChunkIds(source.replace("export const ChunkIdsRegex", "export const NewChunkIdsRegex"))).toThrow("Upstream ChunkIdsRegex changed");
    expect(() => supportNumericChunkIds(source.replace("const numChunkId = Number(m[1]);", "const numChunkId = 1;"))).toThrow("Upstream chunk ID extraction changed");
    const unix = source.replaceAll("\r\n", "\n");
    expect(supportNumericChunkIds(unix.replaceAll("\n", "\r\n")).replaceAll("\r\n", "\n")).toBe(supportNumericChunkIds(unix));
});
