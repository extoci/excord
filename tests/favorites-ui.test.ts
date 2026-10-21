import { expect, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createFavoritesPlugin } from "../src/excord/favorites";
import { emptyFavorites } from "../src/excord/favorites/model";

type Node = React.ReactElement<Record<string, any>>;

function find(node: any, predicate: (node: Node) => boolean): Node | undefined {
    if (!React.isValidElement(node)) return;
    const element = node as Node;
    if (predicate(element)) return element;
    if (typeof element.type === "function") return find((element.type as any)(element.props), predicate);
    const children = typeof element.props.children === "function" ? element.props.children({}) : element.props.children;
    for (const child of React.Children.toArray(children)) {
        const result = find(child, predicate); if (result) return result;
    }
}

async function dialogHarness({ captureNative = true } = {}) {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
    let renderingUI = true;
    let Rail!: React.FunctionComponent;
    let renderMenu!: () => Node;
    let renderModal!: (props: { transitionState: number; onClose(): void }) => Node;
    let dialogProps: any;
    const data = emptyFavorites();
    let accountId = "account-a";
    let accountListener = () => {};
    const saves: any[] = [];
    const messages: string[] = [];
    const lazy = (...terms: unknown[]) => `native-${terms.join("|")}`;
    const connect = (node: unknown) => node;
    const common = {
        React: { ...React, useSyncExternalStore() {}, useRef: () => ({ current: null }), useMemo: (get: () => unknown) => get(),
            useState: (initial: unknown) => renderingUI ? [initial, () => {}] : React.useState(initial) },
        useStateFromStores: (_stores: unknown[], get: () => unknown) => get(),
        useDrag: () => [{}, connect], useDrop: () => [{ over: false }, connect],
        UserStore: { getCurrentUser: () => ({ id: accountId }), addChangeListener(listener: () => void) { accountListener = listener; }, removeChangeListener() {} },
        ChannelStore: { getChannel() {} }, PermissionStore: {}, ReadStateStore: {}, UserGuildSettingsStore: {}, JoinedThreadsStore: {}, ActiveJoinedThreadsStore: {},
        NavigationRouter: { transitionTo() {} },
        Menu: { Menu: "native-menu", MenuItem: "native-menu-item", MenuGroup: "native-menu-group" },
        Clickable: "native-clickable", Text: "native-text", ScrollerThin: "native-scroller", Tooltip: "native-tooltip",
        ContextMenuApi: { openContextMenu: (_event: unknown, render: () => Node) => { renderMenu = render; } },
        Modal: (props: any) => { dialogProps = props; return React.createElement("dialog", { open: true }, props.title, props.children); },
        TextInput: (props: any) => React.createElement("input", { value: props.value, readOnly: true }),
        openModal: (render: typeof renderModal) => { renderModal = render; },
        openModalLazy: async (load: () => Promise<typeof renderModal>) => { renderModal = await load(); },
        Toasts: { show() {} }, showToast(message: string) { messages.push(message); }
    };
    const plugin = createFavoritesPlugin({
        "@webpack/common": common,
        "@api/DataStore": { get: async () => data, set: async (_key: string, value: unknown) => { saves.push(value); } },
        "@api/ServerList": { addServerListElement: (_position: unknown, render: React.FunctionComponent) => { Rail = render; }, removeServerListElement() {} },
        "@components/ErrorBoundary": { default: "native-error-boundary" },
        "@webpack": { filters: { byCode: () => () => true, byProps: () => () => true }, findComponentByCodeLazy: lazy,
            findByCodeLazy: () => () => ({}),
            findByPropsLazy: () => ({ addRouteChangeListener: () => () => {} }),
            extractAndLoadChunksLazy: () => async () => true,
            mapMangledModuleLazy: (code: string) => code.includes("ListItem")
                ? { ListItem: "native-rail-item" }
                : { useRailItem: () => ({}), useListProps: () => ({}), Provider: "native-nav-provider" },
            findCssClassesLazy: () => ({}) }
    });
    if (captureNative) plugin.captureCategory((props: any) => React.createElement("native-category", { ...props.excordFavoritesCategory }, props.children));
    plugin.start();
    await new Promise(resolve => setTimeout(resolve, 0));
    const rail = Rail({}) as Node;
    try { await find(rail, e => !!e.props["data-excord-favorites"] && !!e.props.onClick)!.props.onClick(); }
    catch (error) {
        plugin.stop();
        if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
        throw error;
    }
    const sidebar = () => plugin.renderSidebar(() => null);
    return {
        async open(rename: boolean) {
            const target = find(sidebar(), e => rename ? !!e.props.onContextMenu && ("aria-expanded" in e.props || "collapsed" in e.props) : e.type === "native-clickable" && !!e.props.onClick)!;
            if (rename) target.props.onContextMenu({}); else target.props.onClick({});
            const action = find(renderMenu(), e => e.props.id === (rename ? "excord-category-rename" : "excord-category-new"))!;
            await action.props.action();
            await Promise.resolve();
            renderingUI = false;
            // Discord's modal layer is a class component. It invokes this callback
            // directly from render(), outside the function-component hook dispatcher.
            return () => renderModal({ transitionState: 1, onClose() {} });
        },
        render(node: Node) { return renderToStaticMarkup(node); },
        props: () => dialogProps,
        async switchAccount() { accountId = "account-b"; accountListener(); await new Promise(resolve => setTimeout(resolve, 0)); },
        saves,
        messages,
        cleanup() { plugin.stop(); if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document"); }
    };
}

test("a missing native category renderer reports an error without rejecting the Favorites click", async () => {
    const h = await dialogHarness({ captureNative: false });
    try { expect(h.messages).toEqual(["Favorites is unavailable in this Discord build. Your saved favorites are preserved."]); }
    finally { h.cleanup(); }
});

for (const rename of [false, true]) test(`${rename ? "rename" : "create"} category opens through Discord's modal callback without an invalid hook call`, async () => {
    const h = await dialogHarness();
    try {
        const render = await h.open(rename);
        let element!: Node;
        expect(() => { element = render(); }).not.toThrow();
        expect(h.render(element)).toContain(rename ? "Rename category" : "Create category");
        expect(h.props().actions[0].disabled).toBe(!rename);
    } finally { h.cleanup(); }
});

test("an open category dialog cannot save into a different account", async () => {
    const h = await dialogHarness();
    try {
        const render = await h.open(true);
        h.render(render());
        const save = h.props().actions[0].onClick;
        await h.switchAccount();
        save();
        await Promise.resolve();
        expect(h.saves).toHaveLength(0);
        expect(render()).toBeNull();
    } finally { h.cleanup(); }
});

test("saving through the category dialog persists its existing category", async () => {
    const h = await dialogHarness();
    try {
        const render = await h.open(true);
        h.render(render());
        h.props().actions[0].onClick();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(h.saves[0].categories[0].name).toBe("Channels");
    } finally { h.cleanup(); }
});
