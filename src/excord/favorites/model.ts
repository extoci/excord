export interface FavoriteCategory {
    id: string;
    name: string;
    collapsed: boolean;
    channelIds: string[];
}

export interface FavoritesData {
    version: 1;
    categories: FavoriteCategory[];
    lastChannelId?: string;
}

export const DEFAULT_CATEGORY = "channels";
export function emptyFavorites(): FavoritesData {
    return { version: 1, categories: [{ id: DEFAULT_CATEGORY, name: "Channels", collapsed: false, channelIds: [] }] };
}

/** Validate persisted data and enforce one occurrence of each real channel ID. */
export function readFavorites(value: unknown): FavoritesData {
    const result = emptyFavorites();
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1) return result;
    const raw = value as Partial<FavoritesData>;
    if (!Array.isArray(raw.categories)) return result;
    const categories: FavoriteCategory[] = [];
    const seenCategories = new Set<string>();
    const seenChannels = new Set<string>();
    for (const category of raw.categories) {
        if (!category || typeof category.id !== "string" || !category.id || seenCategories.has(category.id)
            || typeof category.name !== "string" || !category.name.trim() || !Array.isArray(category.channelIds)) continue;
        seenCategories.add(category.id);
        categories.push({ id: category.id, name: category.name.trim().slice(0, 100), collapsed: category.collapsed === true,
            channelIds: category.channelIds.filter(id => {
                if (typeof id !== "string" || !/^\d+$/.test(id) || seenChannels.has(id)) return false;
                seenChannels.add(id); return true;
            }) });
    }
    if (!seenCategories.has(DEFAULT_CATEGORY)) categories.unshift(result.categories[0]);
    return { version: 1, categories, lastChannelId: typeof raw.lastChannelId === "string" && seenChannels.has(raw.lastChannelId) ? raw.lastChannelId : undefined };
}

export type FavoritesAction =
    | { type: "add"; channelId: string; categoryId: string }
    | { type: "remove"; channelId: string }
    | { type: "move"; channelId: string; categoryId: string; beforeId?: string }
    | { type: "category-add"; id: string; name: string }
    | { type: "category-rename"; id: string; name: string }
    | { type: "category-collapse"; id: string }
    | { type: "category-delete"; id: string }
    | { type: "category-move"; id: string; beforeId?: string }
    | { type: "select"; channelId: string };

export function changeFavorites(data: FavoritesData, action: FavoritesAction): FavoritesData {
    const next = structuredClone(data);
    const category = "categoryId" in action ? next.categories.find(c => c.id === action.categoryId) : undefined;
    const existing = "channelId" in action ? next.categories.find(c => c.channelIds.includes(action.channelId)) : undefined;
    switch (action.type) {
        case "add":
            if (category && !existing && /^\d+$/.test(action.channelId)) category.channelIds.push(action.channelId);
            break;
        case "remove":
            if (existing) existing.channelIds = existing.channelIds.filter(id => id !== action.channelId);
            if (next.lastChannelId === action.channelId) delete next.lastChannelId;
            break;
        case "move":
            if (!category || !existing || action.beforeId === action.channelId) break;
            existing.channelIds = existing.channelIds.filter(id => id !== action.channelId);
            { const index = category.channelIds.indexOf(action.beforeId ?? ""); category.channelIds.splice(index < 0 ? category.channelIds.length : index, 0, action.channelId); }
            break;
        case "category-add":
            if (action.name.trim() && !next.categories.some(c => c.id === action.id)) next.categories.push({ id: action.id, name: action.name.trim().slice(0, 100), collapsed: false, channelIds: [] });
            break;
        case "category-rename": {
            const target = next.categories.find(c => c.id === action.id);
            if (target && action.name.trim()) target.name = action.name.trim().slice(0, 100);
            break;
        }
        case "category-collapse": {
            const target = next.categories.find(c => c.id === action.id);
            if (target) target.collapsed = !target.collapsed;
            break;
        }
        case "category-delete": {
            const target = next.categories.find(c => c.id === action.id);
            if (target && target.id !== DEFAULT_CATEGORY) {
                next.categories.find(c => c.id === DEFAULT_CATEGORY)!.channelIds.push(...target.channelIds);
                next.categories = next.categories.filter(c => c.id !== action.id);
            }
            break;
        }
        case "category-move": {
            const target = next.categories.find(c => c.id === action.id);
            if (!target || action.beforeId === action.id) break;
            next.categories = next.categories.filter(c => c !== target);
            const index = next.categories.findIndex(c => c.id === action.beforeId);
            next.categories.splice(index < 0 ? next.categories.length : index, 0, target);
            break;
        }
        case "select": if (existing) next.lastChannelId = action.channelId; break;
    }
    return next;
}

interface Storage {
    get(key: string): Promise<unknown>;
    set(key: string, value: FavoritesData): Promise<unknown>;
}

/** Account changes invalidate outstanding loads; writes retain the original account key. */
export class FavoritesRepository {
    data = emptyFavorites();
    ready = false;
    accountId?: string;
    private generation = 0;
    private writes = Promise.resolve();
    constructor(private storage: Storage, private changed: () => void, private error: (error: unknown) => void) {}
    async load(accountId?: string) {
        const generation = ++this.generation;
        this.accountId = accountId; this.ready = false; this.data = emptyFavorites(); this.changed();
        if (!accountId) return;
        try {
            // A reload must see all writes queued for the previous account session.
            await this.writes;
            const value = await this.storage.get(`ExcordFavorites:v1:${accountId}`);
            if (generation !== this.generation) return;
            this.data = readFavorites(value); this.ready = true; this.changed();
        } catch (error) { if (generation === this.generation) this.error(error); }
    }
    change(action: FavoritesAction) {
        if (!this.ready || !this.accountId) return;
        const key = `ExcordFavorites:v1:${this.accountId}`;
        const value = this.data = changeFavorites(this.data, action);
        this.changed();
        this.writes = this.writes.then(() => this.storage.set(key, value)).then(() => {}, this.error);
    }
}
