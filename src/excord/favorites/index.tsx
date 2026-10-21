import type { ComponentType, MouseEvent, ReactElement, ReactNode } from "react";

import { DEFAULT_CATEGORY, type FavoriteCategory, FavoritesRepository } from "./model";
import { adaptCategory, categoryMatch, guildSidebarChunks } from "./native";

type NativeComponent = ComponentType<Record<string, any>>;
type Common = typeof import("@equicord/types/webpack/common") & {
    JoinedThreadsStore: { isMuted(id: string): boolean; addChangeListener(listener: () => void): void; removeChangeListener(listener: () => void): void };
};
type Channel = ReturnType<Common["ChannelStore"]["getChannel"]>;

export function createFavoritesPlugin(modules: Record<string, unknown>) {
    const common = modules["@webpack/common"] as Common;
    const webpack = modules["@webpack"] as typeof import("@equicord/types/webpack");
    const serverList = modules["@api/ServerList"] as typeof import("@equicord/types/api/ServerList");
    const dataStore = modules["@api/DataStore"] as typeof import("@equicord/types/api/DataStore");
    const ErrorBoundary = (modules["@components/ErrorBoundary"] as { default: NativeComponent }).default;
    const { filters, findComponentByCodeLazy, findByCodeLazy, mapMangledModuleLazy, findCssClassesLazy } = webpack;
    const ChannelRow = findComponentByCodeLazy("resolvedUnreadSetting:", "forceInteractable:") as NativeComponent;
    const RailButton = findComponentByCodeLazy("backgroundStyle:", "ariaLabel:") as NativeComponent;
    const BlobMask = findComponentByCodeLazy('("BlobMask")') as NativeComponent;
    const NumberBadge = findComponentByCodeLazy("BADGE_NOTIFICATION_BACKGROUND", "renderBadgeCount:") as NativeComponent;
    const Pill = findComponentByCodeLazy("unread:", "hovered:", "overlay:", "disabled:") as NativeComponent;
    const Header = findComponentByCodeLazy("keepToastsBelow:") as NativeComponent;
    const nav = mapMangledModuleLazy('id:"NO_LIST"', {
        Provider: filters.byCode("navigator:", ".Provider"),
        useListProps: filters.byCode('role:"list"', '"aria-orientation"', "useContext"),
        useRailItem: filters.byCode('role:"treeitem"', '"aria-level"'),
    }) as { Provider: NativeComponent; useListProps(): Record<string, unknown>; useRailItem(id: string): Record<string, unknown> };
    const useNavigator = findByCodeLazy(/keyboardModeEnabled\);return\(0,\i\.\i\)\(\{id:/, "scrollToStart:") as (id: string) => unknown;
    const routeChanges = webpack.findByPropsLazy("addRouteChangeListener") as {
        addRouteChangeListener(callback: (route: { pathname: string }) => void): () => void;
    };
    // Discord's ListItem is the wrapper every native rail item uses. Reusing it
    // keeps the star on the same layout metrics as Home without resolving a CSS
    // module that may not be loaded yet.
    const ListItem = (findByCodeLazy('displayName="ListItem"') as { c: NativeComponent }).c;
    const channelClasses = findCssClassesLazy("containerDefault", "iconVisibility", "iconBase");
    const requireGuildSidebar = webpack.extractAndLoadChunksLazy(['name:"GuildSidebar"'], guildSidebarChunks);
    const requireSettingsModal = webpack.extractAndLoadChunksLazy(['type:"USER_SETTINGS_MODAL_OPEN"']);
    const createChannelRecord = findByCodeLazy(".GUILD_TEXT]", "fromServer)") as (data: Record<string, unknown>) => Channel;
    let NativeCategory: NativeComponent | undefined;
    let running = false;
    let active = false;
    let opening = 0;
    let revision = 0;
    let removeRouteListener: (() => void) | undefined;
    const listeners = new Set<() => void>();
    const emit = () => { revision++; for (const listener of listeners) listener(); };
    const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
    const notifyError = (error: unknown) => {
        console.error("[ExcordFavorites] Could not load or save favorites", error);
        common.showToast("Favorites could not be loaded or saved. Reload Excord to try again.", "failure");
    };
    const repository = new FavoritesRepository(dataStore, emit, notifyError);
    const useFavorites = () => { common.React.useSyncExternalStore(subscribe, () => revision); return repository.data; };
    const contains = (id: string) => repository.data.categories.some(c => c.channelIds.includes(id));

    function Star({ width = 24, height = 24 }: { width?: number; height?: number }) {
        const { React } = common;
        return <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.76 5.82 21 7 14.14 2 9.27l6.91-1.01Z" /></svg>;
    }

    function available(channel: Channel | undefined): channel is Channel {
        return !!channel && channel.type !== 4 && (!channel.guild_id || common.PermissionStore.can(common.PermissionsBits.VIEW_CHANNEL, channel));
    }

    function unreadState(channel: Channel) {
        const { ReadStateStore, UserGuildSettingsStore, JoinedThreadsStore, ActiveJoinedThreadsStore } = common;
        const muted = channel.guild_id
            ? UserGuildSettingsStore.isGuildOrCategoryOrChannelMuted(channel.guild_id, channel.id) || channel.isThread() && JoinedThreadsStore.isMuted(channel.id)
            : UserGuildSettingsStore.isChannelMuted(channel.getGuildId(), channel.id);
        const mentions = ReadStateStore.getMentionCount(channel.id);
        const unread = ReadStateStore.hasUnread(channel.id)
            || !!(channel.guild_id && channel.isForumLikeChannel() && ActiveJoinedThreadsStore.getNewThreadCount(channel.guild_id, channel.id));
        return { muted, mentions, unread: unread && !muted, resolvedUnreadSetting: UserGuildSettingsStore.resolveUnreadSetting(channel) };
    }

    function useUnread(channelIds: string[]) {
        return common.useStateFromStores([common.ChannelStore, common.PermissionStore, common.ReadStateStore, common.UserGuildSettingsStore, common.JoinedThreadsStore, common.ActiveJoinedThreadsStore], () => {
            let unread = false, mentions = 0;
            for (const id of new Set(channelIds)) {
                const channel = common.ChannelStore.getChannel(id);
                if (!available(channel)) continue;
                const state = unreadState(channel);
                unread ||= state.unread;
                mentions += state.mentions;
            }
            return { unread, mentions };
        });
    }

    function setActive(value: boolean) { if (!value) opening++; active = value && running && repository.ready; emit(); }
    function select(channel: Channel) {
        repository.change({ type: "select", channelId: channel.id });
        if (channel.isThread()) common.ChannelRouter.transitionToThread(channel);
        else common.ChannelRouter.transitionToChannel(channel.id);
    }
    async function openFavorites() {
        if (!repository.ready) return;
        const request = ++opening;
        const { accountId } = repository;
        try {
            if (!NativeCategory && !await requireGuildSidebar()) throw new Error("Could not load Discord's category component");
            if (!NativeCategory) throw new Error("Discord's category component was not found");
        } catch (error) {
            console.error("[ExcordFavorites] Native category UI unavailable", error);
            common.showToast("Favorites is unavailable in this Discord build. Your saved favorites are preserved.", "failure");
            return;
        }
        if (request !== opening || !running || accountId !== repository.accountId || !repository.ready) return;
        setActive(true);
        const ids = repository.data.categories.flatMap(c => c.channelIds);
        const last = repository.data.lastChannelId;
        const channel = [last, ...ids].filter((id): id is string => !!id).map(id => common.ChannelStore.getChannel(id)).find(available);
        if (channel) select(channel);
        else common.NavigationRouter.transitionTo("/channels/@me");
    }

    function Rail() {
        const { React } = common;
        const data = useFavorites();
        const state = useUnread(data.categories.flatMap(c => c.channelIds));
        const [hovered, setHovered] = React.useState(false);
        const itemProps = nav.useRailItem("excord-favorites");
        if (!running) return null;
        return <ListItem>
            <Pill data-excord-favorites="true" overlay selected={active} hovered={hovered} unread={state.unread} />
            <common.Tooltip text="Favorites" position="right">{tooltipProps => {
                const { onMouseEnter, onMouseLeave, ...rest } = tooltipProps as Record<string, any>;
                return <div {...rest}
                    onMouseEnter={event => { setHovered(true); onMouseEnter?.(event); }}
                    onMouseLeave={event => { setHovered(false); onMouseLeave?.(event); }}>
                    <BlobMask selected={active} lowerBadge={state.mentions > 0 ? <NumberBadge count={state.mentions} /> : null}
                        lowerBadgeSize={{ width: state.mentions < 10 ? 16 : state.mentions < 100 ? 22 : 30, height: 16 }}>
                        <RailButton {...itemProps} data-excord-favorites="true" ariaLabel="Favorites" aria-selected={active} selected={active || hovered} onClick={openFavorites}>
                            <Star />
                        </RailButton>
                    </BlobMask>
                </div>;
            }}</common.Tooltip>
        </ListItem>;
    }

    function CategoryDialog({ category, accountId, modalProps }: {
        category?: FavoriteCategory; accountId?: string;
        modalProps: { transitionState: number; onClose(): void };
    }) {
        const { React, Modal, TextInput } = common;
        const [name, setName] = React.useState(category?.name ?? "");
        const save = () => {
            if (!name.trim() || accountId !== repository.accountId || !repository.ready) return;
            repository.change(category ? { type: "category-rename", id: category.id, name } : { type: "category-add", id: crypto.randomUUID(), name });
            modalProps.onClose();
        };
        return <Modal {...modalProps} title={category ? "Rename category" : "Create category"}
            actions={[{ text: "Save", variant: "primary", disabled: !name.trim(), onClick: save }]}>
            <TextInput value={name} onChange={setName} maxLength={100} autoFocus placeholder="Category name" onKeyDown={event => { if (event.key === "Enter") save(); }} />
        </Modal>;
    }
    function promptCategory(category?: FavoriteCategory) {
        const { React } = common;
        const { accountId } = repository;
        void common.openModalLazy(async () => {
            if (!await requireSettingsModal()) throw new Error("Could not load Discord's category dialog");
            return props => running && repository.ready && accountId === repository.accountId
                ? <CategoryDialog modalProps={props} category={category} accountId={accountId} /> : null;
        });
    }

    function menu(event: MouseEvent, children: ReactNode) {
        const { React, ContextMenuApi, Menu } = common;
        ContextMenuApi.openContextMenu(event, () => <Menu.Menu navId="excord-favorites" onClose={ContextMenuApi.closeContextMenu} aria-label="Favorites">{children}</Menu.Menu>);
    }
    function channelItems(channel: Channel) {
        const { React, Menu } = common;
        const favorite = contains(channel.id);
        return <Menu.MenuGroup>
            {favorite ? <Menu.MenuItem id="excord-favorites-remove" label="Remove from Favorites" action={() => repository.change({ type: "remove", channelId: channel.id })} />
                : <Menu.MenuItem id="excord-favorites-add" label="Add to Favorites" action={() => repository.change({ type: "add", channelId: channel.id, categoryId: DEFAULT_CATEGORY })} />}
            {repository.data.categories.length > 1 && <Menu.MenuItem id="excord-favorites-category" label={favorite ? "Move favorite to" : "Add favorite to"}>
                {repository.data.categories.map(c => <Menu.MenuItem key={c.id} id={`excord-favorites-${c.id}`} label={c.name}
                    action={() => repository.change({ type: favorite ? "move" : "add", channelId: channel.id, categoryId: c.id })} />)}
            </Menu.MenuItem>}
        </Menu.MenuGroup>;
    }
    function contextMenuPatch(children: ReactNode[], props: { channel?: Channel }) {
        if (repository.ready && available(props.channel)) children.push(channelItems(props.channel));
    }

    function useReorder(kind: "channel" | "category", id: string, categoryId: string) {
        const { React, useDrag, useDrop } = common;
        const ref = React.useRef<HTMLLIElement>(null);
        const { accountId } = repository;
        const [, drag] = useDrag(() => ({ type: `EXCORD_FAVORITE_${kind}`, item: { id, kind, accountId } }), [id, kind, accountId]);
        const [{ over }, drop] = useDrop(() => ({
            accept: ["EXCORD_FAVORITE_channel", "EXCORD_FAVORITE_category"],
            canDrop: (item: { id: string; kind: string; accountId: string }) => item.accountId === repository.accountId && !(item.id === id && item.kind === kind),
            drop: (item: { id: string; kind: string; accountId: string }, monitor: { didDrop(): boolean }) => {
                if (monitor.didDrop() || item.accountId !== repository.accountId) return;
                if (item.kind === "channel") repository.change({ type: "move", channelId: item.id, categoryId, beforeId: kind === "channel" ? id : undefined });
                else if (kind === "category") repository.change({ type: "category-move", id: item.id, beforeId: id });
            },
            collect: (monitor: { isOver(options: { shallow: boolean }): boolean; canDrop(): boolean }) => ({ over: monitor.isOver({ shallow: true }) && monitor.canDrop() })
        }), [kind, id, categoryId, accountId]);
        drag(drop(ref));
        return { ref, style: over ? { outline: "2px solid var(--brand-500)", outlineOffset: -2 } : undefined };
    }

    function Row({ id, categoryId }: { id: string; categoryId: string }) {
        const { React, ChannelStore, PermissionStore, ReadStateStore, UserGuildSettingsStore, JoinedThreadsStore, ActiveJoinedThreadsStore, SelectedChannelStore } = common;
        const drag = useReorder("channel", id, categoryId);
        const channel = common.useStateFromStores([ChannelStore, PermissionStore], () => {
            const c = ChannelStore.getChannel(id); return available(c) ? c : undefined;
        });
        const state = common.useStateFromStores([ReadStateStore, UserGuildSettingsStore, JoinedThreadsStore, ActiveJoinedThreadsStore], () => channel ? unreadState(channel) : undefined);
        const selected = common.useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId() === id);
        const connected = common.useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getVoiceChannelId() === id);
        if (!channel || !state) return null;
        return <li {...drag} className={channelClasses.containerDefault} onClickCapture={() => repository.change({ type: "select", channelId: id })}>
            <ChannelRow channel={channel} guild={common.GuildStore.getGuild(channel.guild_id)} selected={selected} connected={connected} muted={state.muted}
                className={channelClasses.iconVisibility}
                unread={state.unread} mentionCount={state.mentions} resolvedUnreadSetting={state.resolvedUnreadSetting} forceInteractable
                onClick={() => { if (channel.isGuildVocal()) common.ChannelActions.selectVoiceChannel(id); else select(channel); }}
                onContextMenu={(event: MouseEvent) => menu(event, channelItems(channel))}>
                {state.mentions > 0 && <NumberBadge count={state.mentions} />}
            </ChannelRow>
        </li>;
    }

    function Category({ category }: { category: FavoriteCategory }) {
        const { React, Menu } = common;
        const drag = useReorder("category", category.id, category.id);
        // This is a display record only, never inserted into ChannelStore or sent
        // to Discord. Native UI reads its name/type; all actions stay local.
        const record = React.useMemo(() => createChannelRecord({ id: `excord-favorites-${category.id}`, type: 4, name: category.name }), [category.id, category.name]);
        if (!NativeCategory) throw new Error("Discord's category component was not loaded");
        return <React.Fragment>
            <NativeCategory channel={record} disableManageChannels
                connectChannelDragSource={(node: ReactElement) => React.cloneElement(node, drag)}
                connectChannelDropTarget={(node: ReactNode) => node}
                excordFavoritesCategory={{ collapsed: category.collapsed,
                    onClick: () => repository.change({ type: "category-collapse", id: category.id }),
                    onContextMenu: (event: MouseEvent) => menu(event, <Menu.MenuGroup>
                    <Menu.MenuItem id="excord-category-new" label="Create category" action={() => promptCategory()} />
                    <Menu.MenuItem id="excord-category-rename" label="Rename category" action={() => promptCategory(category)} />
                    <Menu.MenuItem id="excord-category-up" label="Move category up" disabled={repository.data.categories[0].id === category.id}
                        action={() => { const index = repository.data.categories.findIndex(c => c.id === category.id); repository.change({ type: "category-move", id: category.id, beforeId: repository.data.categories[index - 1]?.id }); }} />
                    {category.id !== DEFAULT_CATEGORY && <Menu.MenuItem id="excord-category-delete" label="Delete category" color="danger"
                        action={() => repository.change({ type: "category-delete", id: category.id })} />}
                </Menu.MenuGroup>) }} />
            {!category.collapsed && category.channelIds.map(id => <Row key={id} id={id} categoryId={category.id} />)}
        </React.Fragment>;
    }
    function List() {
        const { React, ScrollerThin, Menu } = common;
        const data = useFavorites();
        const listProps = nav.useListProps();
        return <ScrollerThin {...listProps} aria-label="Favorite channels" style={{ flex: 1 }}><ul style={{ padding: 0, margin: 0, listStyle: "none" }} onContextMenu={(event: MouseEvent) => {
            if (event.target === event.currentTarget) menu(event, <Menu.MenuItem id="excord-category-new" label="Create category" action={() => promptCategory()} />);
        }}>
            {data.categories.map(category => <Category key={category.id} category={category} />)}
            {!data.categories.some(c => c.channelIds.length) && <li><common.Text variant="text-sm/normal" color="text-muted" style={{ padding: 16 }}>Right-click a channel or conversation and choose Add to Favorites.</common.Text></li>}
        </ul></ScrollerThin>;
    }
    function FavoritesView() {
        const { React, Clickable, Menu } = common;
        const navigator = useNavigator("excord-favorites");
        return <nav aria-label="Favorites" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Header><Clickable onClick={(event: MouseEvent) => menu(event, <Menu.MenuItem id="excord-category-new" label="Create category" action={() => promptCategory()} />)}>
                <common.Text variant="heading-md/semibold">Favorites</common.Text>
            </Clickable></Header>
            <nav.Provider navigator={navigator}><List /></nav.Provider>
        </nav>;
    }
    function Sidebar({ fallback }: { fallback(): ReactNode }) {
        const { React } = common;
        useFavorites();
        return running && active && repository.ready
            ? <ErrorBoundary fallback={() => fallback()} onError={() => {
                setActive(false);
                common.showToast("Favorites is unavailable in this Discord build. Your saved favorites are preserved.", "failure");
            }}><FavoritesView /></ErrorBoundary>
            : fallback();
    }

    const railClick = (event: Event) => {
        const { target } = event;
        if (target instanceof Element && !target.closest("[data-excord-favorites]")
            && target.closest('[data-guilds-bar-home], [data-list-item-id^="guildsnav___"]')) setActive(false);
    };
    const accountChanged = () => {
        setActive(false);
        void repository.load(common.UserStore.getCurrentUser()?.id);
    };
    return {
        name: "ExcordFavorites",
        description: "Keep channels and conversations from across Discord in one Favorites sidebar.",
        authors: [{ name: "Excord", id: 0n }],
        enabledByDefault: true,
        dependencies: ["ServerListAPI"],
        startAt: "WebpackReady",
        captureCategory(component: NativeComponent) { NativeCategory = component; return component; },
        renderSidebar(fallback: () => ReactNode) {
            const { React } = common;
            return <Sidebar fallback={fallback} />;
        },
        useRailProps(props: Record<string, unknown>) {
            useFavorites();
            return active && !props["data-excord-favorites"] ? { ...props, selected: false, "aria-selected": false } : props;
        },
        patches: [{
            find: '"Resize Sidebar"',
            replacement: {
                match: /(?<=\.\.\.\i,children:)(\(0,\i\.jsx\)\(\i,\{\}\))(?=\}\),\(0,\i\.jsx\)\(\i\.\i,\{children:\(0,\i\.jsx\)\("div",\{role:"separator")/,
                replace: "$self.renderSidebar(()=>$1)"
            }
        }, {
            find: /selected:\i=!1,hovered:\i=!1,unread:\i=!1,disabled:\i=!1,className:\i,overlay:/,
            replacement: {
                match: /(function \i\((\i)\)\{)(?=let\{selected:\i=!1,hovered:\i=!1,unread:)/,
                replace: "$1$2=$self.useRailProps($2);"
            }
        }, {
            find: /backgroundStyle:\i="always",children:\i,icon:\i,name:\i,ariaLabel:/,
            replacement: {
                match: /(function \i\((\i)\)\{)(?=let \i,\i,\{backgroundStyle:)/,
                replace: "$1$2=$self.useRailProps($2);"
            }
        }, {
            find: categoryMatch,
            replacement: { match: categoryMatch, replace: adaptCategory }
        }],
        contextMenus: Object.fromEntries(["channel-context", "thread-context", "user-context", "gdm-context"].map(id => [id, contextMenuPatch])),
        start() {
            running = true;
            accountChanged();
            common.UserStore.addChangeListener(checkAccount);
            document.addEventListener("click", railClick, true);
            serverList.addServerListElement(0, Rail, 1000);
            removeRouteListener = routeChanges.addRouteChangeListener(route => { if (!route.pathname.startsWith("/channels/")) setActive(false); });
        },
        stop() {
            running = false; setActive(false);
            common.UserStore.removeChangeListener(checkAccount);
            document.removeEventListener("click", railClick, true);
            serverList.removeServerListElement(0, Rail);
            removeRouteListener?.(); removeRouteListener = undefined;
            void repository.load();
        }
    };
    function checkAccount() { if (common.UserStore.getCurrentUser()?.id !== repository.accountId) accountChanged(); }
}
