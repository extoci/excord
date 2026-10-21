// Capture Discord's category component before its guild drag-and-drop wrapper.
// Keep its markup, keyboard navigation, focus rings, icons and styling intact.
export const categoryMatch = /function\((\i)\)\{let \i,\{channel:\i,connectChannelDragSource:\i,connectChannelDropTarget:\i,disableManageChannels:[\s\S]+?return null!=\i&&null!=\i\?\i\(\i\(\i\)\):\i\}/;

export function adaptCategory(source: string, props: string) {
    const identifier = "([A-Za-z_$][\\w$]*)";
    const classes = source.match(new RegExp(`\\[${identifier}\\.${identifier}\\]:${identifier},\\[${identifier}\\.${identifier}\\]:${identifier},\\[${identifier}\\.${identifier}\\]:!0`));
    const click = source.match(new RegExp(`onClick:${identifier},"aria-label":`));
    const context = source.match(new RegExp(`onContextMenu:${identifier},children:`));
    const action = source.match(new RegExp(`children:null!=${identifier}\\?\\(0,${identifier}\\.jsx\\)\\(${identifier},\\{label:\\1\\.label`));
    if (!classes || !click || !context || !action || !source.includes(";let{role:")) {
        throw new Error("Discord's native category component changed");
    }
    // Only Favorites supplies these overrides. Ordinary server categories keep
    // their original state and callbacks. No guild/channel store is modified.
    const overrides = `if(${props}.excordFavoritesCategory){${classes[3]}=${props}.excordFavoritesCategory.collapsed;${classes[6]}=false;${click[1]}=${props}.excordFavoritesCategory.onClick;${context[1]}=${props}.excordFavoritesCategory.onContextMenu;${action[1]}=null;}`;
    return `$self.captureCategory(${source.replace(";let{role:", `;${overrides}let{role:`)})`;
}

export const guildSidebarChunks = /createPromise:\(\)=>Promise\.all\(\[([^\]]+)\]\)\.then\(\i\.bind\(\i,(\d+)\)\),webpackId:\d+,name:"GuildSidebar"/;
