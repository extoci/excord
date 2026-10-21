# ExcordFavorites

ExcordFavorites adds a star below Home in the server rail. Enable or disable it in Discord Settings → Plugins. Changing its enabled state requires a refresh because it patches Discord's sidebar rendering.

Right-click an existing channel, thread, DM, or group DM and choose **Add to Favorites**. **Add favorite to** selects a category. Each channel can appear once. Right-click a favorite to remove it or move it to another category.

Click the Favorites heading or right-click a category to create a category. Category menus also rename, delete, and move categories. Drag a favorite onto a row to insert it before that row, or onto a category heading to append it. Drag a category onto another heading to reorder it. Deleting a category moves its entries to Channels. Channels remains available as the default category.

Favorites keeps its sidebar open while Discord renders the original conversation, forum, thread, or voice interface. Opening Favorites restores its last available selection without automatically joining a voice call. Clicking Home or a server exits Favorites. Voice rows use Discord's join action. Entries without current access are omitted without deleting their saved references.

Categories, ordering, collapse state, and the last selection are saved locally per Discord account using the bundled DataStore API. They do not sync through Discord. This plugin does not enable or depend on Discord's Favorites experiment.

## Integration

The implementation lives in `src/excord/favorites` and is registered before the bundled plugin manager starts. The vendor tree is unchanged. It uses ServerListAPI for placement and Discord's rail button, mask, selection pill, server category component, channel row and list wrappers, badges, header, menus, modal, scroller, keyboard navigation, and drag-and-drop hooks. Only the channel-list body is replaced; the native server rail, resize control, account panel, chat, and underlying channel records remain under Discord's control.

The category patch captures the native component before its guild drag-and-drop wrapper. Favorites supplies local collapse/menu handlers and a display-only category record. That record never enters ChannelStore, and the component's server mutation actions are replaced only for Favorites. Opening Favorites loads Discord's GuildSidebar chunks if necessary. Category dialogs load the native modal chunks and render their stateful form as a React component, since Discord calls modal render callbacks from a class component.

Unread state comes from ReadStateStore. Mute and unread preferences come from UserGuildSettingsStore and JoinedThreadsStore. Forum new-post indicators come from ActiveJoinedThreadsStore. Entries and the rail subscribe to those stores, ChannelStore, and PermissionStore. Badge counts are not cached or synthesized from incoming message events.

If a native view component fails, the plugin restores Discord's normal sidebar and shows an error. Stored favorites remain intact. Discord updates can still change patch targets or component signatures; signed-in verification is necessary after those changes.

## Verification

Run `bun run check`, `bun run typecheck:reference`, and `bun run build`. The favorites tests cover unique entries, category moves and deletion, corrupt storage, account-switch races, queued saves, storage failure, sidebar patch boundaries, create/rename modal hook safety, native category action isolation, and one-shot patch consumption by earlier tutorial modules. The Electron smoke also loads Discord's real GuildSidebar, verifies that the production plugin captures its category component, and measures the native rail icon alignment.

Signed-in checks should cover text, announcement, forum/media, thread, voice/stage, DM, and group DM entries; category drag-and-drop and collapse; leaving Favorites through Home and server icons; restoring the last selection; read acknowledgements in both directions; mentions and mute changes; permission loss; account switching; and disabling the plugin. Component lookup and build checks alone do not establish those behaviors.

## Quick branch test

Use the `DEV DO NOT INSTALL` prerelease's ZIP for your platform. Quit installed Excord completely, extract the ZIP into a test folder, and put the matching `favorites-dev-launch.command` or `favorites-dev-launch.cmd` beside `Excord.app` or `excord.exe`. On Mac, run `bash favorites-dev-launch.command` from Terminal in that folder. On Windows, double-click the `.cmd` file. Do not move this app into Applications or run a Setup executable. The test build has the same app version as its main-branch base; identify it by its release tag and commit.

The launchers set `EXCORD_USER_DATA_DIR` to a separate `excord-favorites-dev` profile. You will need to sign in again. Keep this profile for restart tests. Your installed app's login, settings, and favorites stay in its usual profile. Excord's single-instance lock is shared, so quit the test build before reopening installed Excord. Do not install updates from the test build.

For a first pass, allow five to ten minutes and use another account or a friend to send messages:

1. Check that one star appears immediately below Home. Add text channels from two servers, a DM, a group DM, a forum, a thread, and a voice channel through their context menus. Adding an existing favorite must not create a duplicate.
2. Open the star and visit each entry. The Favorites list must stay open, the native chat/forum/thread must work, and clicking a voice row must use Discord's normal join flow. Clicking Home or another server must leave Favorites. Reopen it and check the last selection.
3. Create two categories. Drag channels within and between them, reorder categories, rename and collapse one, then delete it. Its entries should move to Channels. Quit and restart with the launcher; check the saved ordering and selection.
4. With a favorite unselected, receive a message and a mention. Compare its indicator and count with the original channel and check the star's count. Read it from Favorites and then from the original server. Counts must clear in both places. Repeat with a muted channel and a forum's new post.
5. Disable ExcordFavorites and refresh. Native navigation must work normally. Re-enable and refresh; saved favorites should return. Check that ExcordVisualizations still works alongside it.

Before merge, also test account switching, keyboard navigation, stage/media channels where available, lost channel access, and both native operating systems. Record the platform, release commit, and any failing step. Do not include account credentials in a report.
