# ExcordFavorites

ExcordFavorites adds a star below Home in the server rail. Enable or disable it in Discord Settings → Plugins. Changing its enabled state requires a refresh because it patches Discord's sidebar rendering.

Right-click an existing channel, thread, DM, or group DM and choose **Add to Favorites**. **Add favorite to** selects a category. Each channel can appear once. Right-click a favorite to remove it or move it to another category.

Click the Favorites heading or right-click a category to create a category. Category menus also rename, delete, and move categories. Drag a favorite onto a row to insert it before that row, or onto a category heading to append it. Drag a category onto another heading to reorder it. Deleting a category moves its entries to Channels. Channels remains available as the default category.

Favorites keeps its sidebar open while Discord renders the original conversation, forum, thread, or voice interface. Opening Favorites restores its last available selection without automatically joining a voice call. Clicking Home or a server exits Favorites. Voice rows use Discord's join action. Entries without current access are omitted without deleting their saved references.

Categories, ordering, collapse state, and the last selection are saved locally per Discord account using the bundled DataStore API. They do not sync through Discord. This plugin does not enable or depend on Discord's Favorites experiment.

## Integration

The implementation lives in `src/excord/favorites` and is registered before the bundled plugin manager starts. The vendor tree is unchanged. It uses ServerListAPI for placement and Discord's rail button, mask, selection pill, channel row, badges, header, menus, modal, scroller, keyboard navigation, and drag-and-drop hooks. Only the channel-list body is replaced; the native server rail, resize control, account panel, chat, and underlying channel records remain under Discord's control.

Unread state comes from ReadStateStore. Mute and unread preferences come from UserGuildSettingsStore and JoinedThreadsStore. Forum new-post indicators come from ActiveJoinedThreadsStore. Entries and the rail subscribe to those stores, ChannelStore, and PermissionStore. Badge counts are not cached or synthesized from incoming message events.

If a native view component fails, the plugin restores Discord's normal sidebar and shows an error. Stored favorites remain intact. Discord updates can still change patch targets or component signatures; signed-in verification is necessary after those changes.

## Verification

Run `bun run check`, `bun run typecheck:reference`, and `bun run build`. The favorites tests cover unique entries, category moves and deletion, corrupt storage, account-switch races, queued saves, storage failure, and sidebar patch boundaries.

Signed-in checks should cover text, announcement, forum/media, thread, voice/stage, DM, and group DM entries; category drag-and-drop and collapse; leaving Favorites through Home and server icons; restoring the last selection; read acknowledgements in both directions; mentions and mute changes; permission loss; account switching; and disabling the plugin. Component lookup and build checks alone do not establish those behaviors.
