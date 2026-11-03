# Windows inactivity freeze investigation

The reported symptom is a frozen Windows window followed by an automatic refresh. A Discord memory leak has not been established. The bundled IdleAutoRestart plugin can produce idle refreshes when enabled, but the owner does not think it is enabled, so it is not treated as the cause.

The added offline harness exercises the actual main-process background policy with a local HTML document, an isolated temporary profile, and a network deny rule. It verifies media protection while hidden, deferred restoration of throttling, site-initiated reloads while hidden, and foreground animation after each reload. Its optional runtime mode loads the real upstream native/preload bundles and checks that five reloads still produce exactly one QuickCSS update notification.

```sh
bun run build
bun run test:background --with-runtime
bun run test:background --idle-ms=310000
```

Set `EXCORD_ELECTRON_EXECUTABLE` to test an older Electron executable. The long test waits five minutes and ten seconds before the first of five reload cycles. The old Electron 43.8.0 and refreshed Electron 45.2.1 both passed on Linux. The native/preload watcher check passed with the refreshed runtime. The mock Developer Portal lifecycle check also passed with Electron 45.

These results narrow the investigation but do not reproduce or fix the Windows symptom. The tests do not use the Windows compositor, Windows power management, a signed-in Discord session, or the owner's plugin configuration. GPU rendering is disabled for the headless Linux run. No workaround or production instrumentation was added, and no user test build was prepared.
