/** Applied to the pinned runtime without editing the vendor tree. */
export function normalizeChunkIds(source: string): string {
    const before = String.raw`export const ChunkIdsRegex = /\("([^"]+?)"\)/g;`;
    const after = String.raw`export const ChunkIdsRegex = /\("?([^"\)]+)"?\)/g;`;
    if (source.split(before).length !== 2) throw new Error("Pinned Equicord chunk loader changed; review the chunk ID transformation");
    return source.replace(before, after);
}
