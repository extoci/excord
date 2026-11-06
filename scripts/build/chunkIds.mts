// Discord emits both numeric and quoted chunk IDs. Preserve the pinned vendor
// source and apply this compatibility change to its shared chunk loader at build.
export function supportNumericChunkIds(source: string): string {
    const original = String.raw`export const ChunkIdsRegex = /\("([^"]+?)"\)/g;`;
    const declaration = source.match(/^export const ChunkIdsRegex = .+;\r?$/m)?.[0];
    if (declaration?.trim() !== original) {
        throw new Error("Upstream ChunkIdsRegex changed; review the numeric chunk ID compatibility transform");
    }
    const extraction = "const numChunkId = Number(m[1]);";
    const value = "return Number.isNaN(numChunkId) ? m[1] : String(numChunkId);";
    if (!source.includes(extraction) || !source.includes(value)) {
        throw new Error("Upstream chunk ID extraction changed; review the compatibility transform");
    }
    // Rspack tests numeric IDs with strict equality when choosing asset URLs.
    // Keep unquoted IDs as numbers and retain the old handling of quoted IDs.
    return source.replace(declaration!, String.raw`export const ChunkIdsRegex = /\((?:"([^"]+)"|(\d+(?:e\d+)?))\)/g;`)
        .replace(extraction, "const chunkId = m[1] ?? m[2]; const numChunkId = Number(chunkId);")
        .replace(value, "return m[2] !== undefined ? numChunkId : Number.isNaN(numChunkId) ? chunkId : String(numChunkId);");
}
