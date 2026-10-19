# Developer Portal integration

Excord adds **Developer → Developer Portal** after the existing categories in Discord Settings. The section appears only when Discord's Developer Mode is enabled under Advanced. It uses that user setting rather than the Experiments plugin's developer overrides.

Selecting the entry opens the official `https://discord.com/developers/applications` site in an Electron WebContentsView. The original Discord renderer stays alive behind it. A compact 40px strip contains only Back to Excord, using the existing Equicord Button component with Discord’s theme tokens. Cmd/Ctrl+R or F5 reloads the portal. The portal view has no Excord/Equicord preload, Node integration, or access to the desktop bridge. It shares the main browser session for Discord's ordinary sign-in flow; live-account sign-in has not been tested.

The view is created on demand. Back first navigates away so the site's beforeunload handler can cancel leaving, then destroys the portal view once navigation completes. If the site reports unsaved changes, Excord offers Keep editing or Leave portal. Main-page reload and window shutdown also clean up the view. Window resize and the main renderer's zoom determine the view bounds below the banner. The strip preserves window controls on frameless Windows and space for Mac traffic lights.

Only Discord's portal and sign-in routes stay in the view. Other HTTP/HTTPS links open externally. Unexpected top-level redirects are blocked. The portal can display normal third-party resources and authentication frames without exposing Excord's bridge.

## Local verification

```sh
bun run check
bun run typecheck:reference
bun run build
node --import tsx scripts/portal-smoke.mts
```

The native harness requires Electron's normal system dependencies on Linux. It uses an isolated temporary profile and intercepts all HTTPS traffic with mock pages. It checks view creation/reuse, shared session, absence of bridge/Node globals, resize/zoom, renderer preservation, resource cleanup, offline retry, main-page reload, and cancellation of unsaved-change navigation. It does not log into Discord or submit bot/application actions. The harness uses test-only IPC for inspection because the pinned Playwright Node inspector can lose its evaluation context after a WebContentsView is created.

The visual mocks and screenshot preview were removed before release. The native harness creates a temporary page containing only test controls; it never substitutes a mock screen in the shipped application.

Physical Mac/Windows layout and real-account authentication still need verification on devices.
