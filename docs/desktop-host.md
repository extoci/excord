# Desktop host

Excord uses Electron for v0. The user confirmed this choice after considering GPUI on 2026-10-18. It is a compatibility decision, not a claim that Electron wins a performance comparison.

The GPUI alternative can embed web content through [GPUI WebView](https://github.com/longbridge/gpui-kit/tree/main/crates/webview), which uses Wry. Its [platform record](https://github.com/longbridge/gpui-kit/blob/main/crates/webview/README.md) identifies WKWebView on macOS and WebView2 on Windows. It also marks the integration experimental and documents a Windows overlay limitation. GPUI would render native application controls; the embedded browser would still render Discord.

System webviews could avoid bundling Chromium. That supports investigating smaller downloads, but it does not establish lower memory use or faster Discord rendering. [Wry](https://github.com/tauri-apps/wry#platform-considerations) uses different browser engines across platforms, so a migration would need separate compatibility and media checks on each target.

Excord's current native plugin implementation executes TypeScript compiled to Node modules and shares Equicord's native APIs. Existing plugins can import Node and Electron. A Rust host would need replacements for those APIs, a retained JavaScript host, or a narrower compatibility promise. Keeping Electron lets v0 preserve those integrations while measuring and improving the renderer, startup work, and optional background services.

Reconsider the host when an isolated prototype demonstrates gains on both target platforms. Compare cold startup, refresh time, idle CPU, total process memory, installer size, and sustained call and screen-sharing behavior using the same account and plugin settings. Record browser versions and include child processes. A smaller executable alone is insufficient evidence of a faster client.
