/** Applied to the pinned runtime without editing the vendor tree. */
export function normalizeChunkIds(source: string): string {
    const before = String.raw`export const ChunkIdsRegex = /\("([^"]+?)"\)/g;`;
    const after = String.raw`export const ChunkIdsRegex = /\("?([^"\)]+)"?\)/g;`;
    const numeric = "return Number.isNaN(numChunkId) ? m[1] : String(numChunkId);";
    if (source.split(before).length !== 2 || source.split(numeric).length !== 2)
        throw new Error("Pinned Equicord chunk loader changed; review the chunk ID transformation");
    // Discord's URL resolver now uses strict numeric comparisons for these IDs.
    return source.replace(before, after).replace(numeric, "return Number.isNaN(numChunkId) ? m[1] : numChunkId;");
}
