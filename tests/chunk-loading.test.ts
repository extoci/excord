import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { supportNumericChunkIds } from "../scripts/build/chunkIds.mts";

test("the chunk loader transform rejects upstream drift and accepts Windows newlines", async () => {
    const source = await readFile("vendor/equicord/src/webpack/webpack.ts", "utf8");
    expect(() => supportNumericChunkIds(source.replace("export const ChunkIdsRegex", "export const NewChunkIdsRegex"))).toThrow("Upstream ChunkIdsRegex changed");
    expect(() => supportNumericChunkIds(source.replace("const numChunkId = Number(m[1]);", "const numChunkId = 1;"))).toThrow("Upstream chunk ID extraction changed");
    const unix = source.replaceAll("\r\n", "\n");
    expect(supportNumericChunkIds(unix.replaceAll("\n", "\r\n")).replaceAll("\r\n", "\n")).toBe(supportNumericChunkIds(unix));
});
