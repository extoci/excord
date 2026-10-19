/** One track, backed by immutable published GitHub Release assets. */
export const UPDATE_METADATA = "latest.yml";
export const RELEASES_URL = "https://github.com/extoci/excord/releases";
const API_URL = "https://api.github.com/repos/extoci/excord/releases?per_page=30";
interface Release { draft: boolean; tag_name: string; assets: { name: string; }[]; }

export function updateCandidates(value: unknown): Release[] {
    if (!Array.isArray(value)) throw new Error("Invalid releases response");
    return value.filter((release): release is Release => !!release && typeof release === "object"
        && release.draft === false && typeof release.tag_name === "string" && /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.tag_name)
        && Array.isArray(release.assets) && [UPDATE_METADATA, "latest-mac.yml"].every(name => release.assets.some((asset: { name?: string; } | null) => asset?.name === name)));
}
export async function resolveUpdateFeed(request: typeof fetch): Promise<string> {
    const response = await request(API_URL, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Release feed unavailable");
    const release = updateCandidates(await response.json())[0];
    if (!release) throw new Error("No update release published yet");
    const url = `${RELEASES_URL}/download/${encodeURIComponent(release.tag_name)}/`;
    return url;
}
