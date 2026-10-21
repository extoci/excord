import { describe, expect, test } from "bun:test";

import { createFavoritesPlugin } from "../src/excord/favorites";
import { changeFavorites, emptyFavorites, FavoritesRepository, readFavorites } from "../src/excord/favorites/model";

describe("favorites ordering", () => {
    test("one channel can only occur once, including across categories", () => {
        let data = changeFavorites(emptyFavorites(), { type: "category-add", id: "work", name: "Work" });
        data = changeFavorites(data, { type: "add", channelId: "123", categoryId: "channels" });
        data = changeFavorites(data, { type: "add", channelId: "123", categoryId: "work" });
        expect(data.categories.map(c => c.channelIds)).toEqual([["123"], []]);
        data = changeFavorites(data, { type: "move", channelId: "123", categoryId: "work" });
        expect(data.categories.map(c => c.channelIds)).toEqual([[], ["123"]]);
    });

    test("reorders within a category, across categories, and to the end", () => {
        let data = emptyFavorites();
        for (const channelId of ["1", "2", "3"]) data = changeFavorites(data, { type: "add", channelId, categoryId: "channels" });
        data = changeFavorites(data, { type: "move", channelId: "3", categoryId: "channels", beforeId: "1" });
        expect(data.categories[0].channelIds).toEqual(["3", "1", "2"]);
        data = changeFavorites(data, { type: "move", channelId: "3", categoryId: "channels" });
        expect(data.categories[0].channelIds).toEqual(["1", "2", "3"]);
        expect(changeFavorites(data, { type: "move", channelId: "1", categoryId: "missing" })).toEqual(data);
    });

    test("deleting a category retains its favorites and last selection", () => {
        let data = changeFavorites(emptyFavorites(), { type: "category-add", id: "work", name: "Work" });
        data = changeFavorites(data, { type: "add", channelId: "123", categoryId: "work" });
        data = changeFavorites(data, { type: "select", channelId: "123" });
        data = changeFavorites(data, { type: "category-delete", id: "work" });
        expect(data.categories).toEqual([{ id: "channels", name: "Channels", collapsed: false, channelIds: ["123"] }]);
        expect(data.lastChannelId).toBe("123");
        expect(changeFavorites(data, { type: "category-delete", id: "channels" })).toEqual(data);
        expect(changeFavorites(data, { type: "remove", channelId: "123" }).lastChannelId).toBeUndefined();
    });

    test("category ordering, collapse, and rename survive serialization", () => {
        let data = changeFavorites(emptyFavorites(), { type: "category-add", id: "work", name: " Work " });
        data = changeFavorites(data, { type: "category-move", id: "work", beforeId: "channels" });
        data = changeFavorites(data, { type: "category-rename", id: "work", name: "Projects" });
        data = changeFavorites(data, { type: "category-collapse", id: "work" });
        expect(readFavorites(JSON.parse(JSON.stringify(data)))).toEqual(data);
        expect(data.categories[0]).toEqual({ id: "work", name: "Projects", collapsed: true, channelIds: [] });
    });

    test("corrupt storage cannot introduce duplicate entries or category IDs", () => {
        const data = readFavorites({ version: 1, lastChannelId: "missing", categories: [
            { id: "work", name: "Work", collapsed: true, channelIds: ["123", "123", "bad", null] },
            { id: "work", name: "Duplicate", channelIds: ["999"] },
            { id: "other", name: "Other", channelIds: ["123", "456"] }, null
        ] });
        expect(data.categories.map(c => [c.id, c.channelIds])).toEqual([["channels", []], ["work", ["123"]], ["other", ["456"]]]);
        expect(data.lastChannelId).toBeUndefined();
        expect(readFavorites({ version: 99 })).toEqual(emptyFavorites());
    });
});

describe("account-scoped persistence", () => {
    test("a late account load cannot replace the next account's data", async () => {
        let finish!: (value: unknown) => void;
        const pending = new Promise(resolve => { finish = resolve; });
        const repository = new FavoritesRepository({ get: key => key.endsWith(":a") ? pending : Promise.resolve(emptyFavorites()), set: async () => {} }, () => {}, error => { throw error; });
        const a = repository.load("a");
        await Promise.resolve();
        await repository.load("b");
        repository.change({ type: "add", channelId: "456", categoryId: "channels" });
        finish(changeFavorites(emptyFavorites(), { type: "add", channelId: "123", categoryId: "channels" }));
        await a;
        expect(repository.accountId).toBe("b");
        expect(repository.data.categories[0].channelIds).toEqual(["456"]);
    });

    test("queued saves keep their original account and finish before a reload", async () => {
        const saved = new Map<string, unknown>();
        const writes: string[] = [];
        const repository = new FavoritesRepository({ get: async key => saved.get(key), set: async (key, value) => {
            await Promise.resolve(); writes.push(key); saved.set(key, structuredClone(value));
        } }, () => {}, error => { throw error; });
        await repository.load("a");
        repository.change({ type: "add", channelId: "123", categoryId: "channels" });
        await repository.load("b");
        repository.change({ type: "add", channelId: "456", categoryId: "channels" });
        await repository.load("a");
        expect(repository.data.categories[0].channelIds).toEqual(["123"]);
        expect(writes).toEqual(["ExcordFavorites:v1:a", "ExcordFavorites:v1:b"]);
        await repository.load();
        repository.change({ type: "add", channelId: "999", categoryId: "channels" });
        expect(repository.ready).toBe(false);
        expect(repository.data.categories[0].channelIds).toEqual([]);
    });

    test("failed loading cannot overwrite existing data with an empty list", async () => {
        const errors: unknown[] = [];
        let saves = 0;
        const repository = new FavoritesRepository({ get: async () => { throw new Error("offline"); }, set: async () => { saves++; } }, () => {}, error => errors.push(error));
        await repository.load("a");
        repository.change({ type: "add", channelId: "123", categoryId: "channels" });
        expect(repository.ready).toBe(false);
        expect(saves).toBe(0);
        expect(errors).toHaveLength(1);
    });
});

test("sidebar patch replaces only the channel-list body, retaining rail, panels, and resize controls", () => {
    const dummy = () => () => null;
    const plugin = createFavoritesPlugin({
        "@webpack/common": {}, "@api/ServerList": {}, "@api/DataStore": {}, "@components/ErrorBoundary": { default: dummy },
        "@webpack": { filters: { byCode: dummy }, findComponentByCodeLazy: dummy, findByCodeLazy: dummy, findByPropsLazy: dummy, mapMangledModuleLazy: dummy, findCssClassesLazy: dummy }
    });
    const replacement = plugin.patches[0].replacement;
    const match = new RegExp(replacement.match.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));
    const body = '(0,r.jsxs)("div",{children:[rail,(0,r.jsx)("div",{...styles,children:(0,r.jsx)(NativeChannelList,{})}),(0,r.jsx)(focus.Scope,{children:(0,r.jsx)("div",{role:"separator","aria-label":"Resize Sidebar"})}),panels]})';
    expect([...body.matchAll(new RegExp(match, "g"))]).toHaveLength(1);
    const patched = body.replace(match, replacement.replace);
    expect(patched).toContain('$self.renderSidebar(()=>(0,r.jsx)(NativeChannelList,{}))');
    expect(patched).toContain('"aria-label":"Resize Sidebar"');
    expect(patched).toContain("}),panels]");
    const railPatch = plugin.patches[2];
    const railFind = new RegExp(railPatch.find.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));
    expect(railFind.test('function Rail(props){let a,b,{backgroundStyle:style="always",children:child,icon:icon,name:name,ariaLabel:label}=props}')).toBe(true);
    expect(railFind.test('function Marketing(props){let{backgroundAsset:asset,backgroundStyle:style,shouldApplyFade:fade}=props}')).toBe(false);
});

test("rail reads current unread/mention state, observes notification stores, and omits inaccessible favorites", async () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
    try {
        type Element = { type: unknown; props: Record<string, any> };
        const node = (type: unknown, props: any, ...children: any[]): Element => ({ type, props: { ...props, children } });
        const counts: Record<string, number> = { "1": 3, "2": 2, "3": 0, "4": 9 };
        const unread = new Set(["1", "2", "3", "4"]);
        const muted = new Set(["2"]);
        const channels = Object.fromEntries(["1", "2", "3", "4"].map(id => [id, {
            id, type: 0, guild_id: "guild", getGuildId: () => "guild", isThread: () => false, isForumLikeChannel: () => id === "3"
        }]));
        const notificationStores = {
            ChannelStore: { getChannel: (id: string) => channels[id] },
            PermissionStore: { can: (_permission: unknown, channel: { id: string }) => channel.id !== "4" },
            ReadStateStore: { hasUnread: (id: string) => unread.has(id), getMentionCount: (id: string) => counts[id] },
            UserGuildSettingsStore: { isGuildOrCategoryOrChannelMuted: (_guild: string, id: string) => muted.has(id), resolveUnreadSetting: () => 0 },
            JoinedThreadsStore: { isMuted: () => false },
            ActiveJoinedThreadsStore: { getNewThreadCount: (_guild: string, id: string) => id === "3" ? 1 : 0 }
        };
        let observedStores: unknown[] = [];
        let Rail!: () => Element;
        const lazyComponent = (...terms: unknown[]) => terms.join("|");
        const data = emptyFavorites(); data.categories[0].channelIds = ["1", "2", "3", "4"];
        const plugin = createFavoritesPlugin({
            "@webpack/common": {
                ...notificationStores, PermissionsBits: { VIEW_CHANNEL: 1n }, Tooltip: "native-tooltip",
                React: { createElement: node, useSyncExternalStore() {}, useState: () => [false, () => {}] },
                useStateFromStores: (stores: unknown[], get: () => unknown) => { observedStores = stores; return get(); },
                UserStore: { getCurrentUser: () => ({ id: "a" }), addChangeListener() {}, removeChangeListener() {} }
            },
            "@api/ServerList": { addServerListElement: (_position: unknown, render: () => Element) => { Rail = render; }, removeServerListElement() {} },
            "@api/DataStore": { get: async () => data, set: async () => {} },
            "@components/ErrorBoundary": { default: "error-boundary" },
            "@webpack": {
                filters: { byCode: () => () => true }, findComponentByCodeLazy: lazyComponent, findByCodeLazy: lazyComponent,
                findByPropsLazy: () => ({ addRouteChangeListener: () => () => {} }),
                mapMangledModuleLazy: () => ({ useRailItem: () => ({ role: "treeitem" }) }), findCssClassesLazy: () => ({ listItem: "native-list-item" })
            }
        });
        plugin.start();
        await new Promise(resolve => setTimeout(resolve, 0));
        const find = (element: any, predicate: (element: Element) => boolean): Element | undefined => {
            if (!element || typeof element !== "object") return;
            if (element.type && predicate(element)) return element;
            for (const child of [element.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
        };
        const state = () => {
            const tree = Rail();
            const pill = find(tree, e => String(e.type).includes("overlay:"))!;
            // Tooltip's render function contains the native mask and mention badge.
            const tooltip = find(tree, e => e.props.text === "Favorites")!;
            const renderTooltip = Array.isArray(tooltip.props.children) ? tooltip.props.children[0] : tooltip.props.children;
            const mask = find(renderTooltip({}), e => String(e.type).includes("BlobMask"))!;
            return { unread: pill.props.unread, count: mask.props.lowerBadge?.props.count ?? 0 };
        };
        expect(state()).toEqual({ unread: true, count: 5 });
        expect(observedStores).toEqual(Object.values(notificationStores));
        unread.clear(); counts["1"] = 0; counts["2"] = 0;
        // A forum can remain unread from its new-thread store after text read state clears.
        expect(state()).toEqual({ unread: true, count: 0 });
        muted.add("3");
        expect(state()).toEqual({ unread: false, count: 0 });
        counts["1"] = 1; unread.add("1");
        expect(state()).toEqual({ unread: true, count: 1 });
        plugin.stop();
    } finally {
        if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
        else Reflect.deleteProperty(globalThis, "document");
    }
});
