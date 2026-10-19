# Excord

Excord is an alternative way to use Discord, by wrapping the web app in Electron.

> "Yeah bro it's like [Legcord](https://github.com/legcord/legcord) but basically built on top of [Equibop](https://github.com/Equicord/equibop) which is a a fork of [Vesktop](https://github.com/Vencord/Vesktop) which is a wrapper of the Discord web app but with [Vencord](https://github.com/Vendicated/Vencord) on it but with [Equicord](https://github.com/Equicord/Equicord) on it which is a fork of Vencord which is basically like [BetterDiscord](https://github.com/betterdiscord/betterdiscord) but better"

It's also built to be extensible. Personal plugins are simply TypeScript files in a folder.

Excord's defaults are opinionated, using the mindset of "go away and let me do my job".

**Warning:** Excord is still in early alpha. While it *probably* won't break horribly, don't rely on it as your only Discord client.

Get it from the [releases page](https://github.com/extoci/excord/releases).

## The slop line

Everything below here was written by agents.

## Install

The current alpha targets Apple silicon Macs running macOS 27+ and Windows x64.

On Mac, open the DMG and drag Excord into Applications. On Windows, run the Setup executable. Updates live in Excord Settings. Checks happen quietly after launch; downloading and installation require your permission. You can install when you quit or explicitly restart to update.

The [alpha guide](docs/closed-alpha.md) covers installation and recovery. There's also a [device checklist](docs/alpha-checklist.md) for testing calls, screen sharing, and the other things you probably expect a Discord client to do.

## Personal plugins

Open Discord Settings → Excord Settings. Click **Create plugin**, or use **Open plugins folder** to add one yourself:

```text
plugins/
└── my-plugin/
    └── index.ts
```

Use the Vencord/Equicord plugin API. Edit the files, then press Cmd+R on Mac or Ctrl+R on Windows. Excord compiles the changed plugins and refreshes Discord. You don't need to restart the app or set up a separate build process.

Your plugins appear in the normal Plugins page. Compilation errors appear in Excord Settings, and a broken plugin doesn't stop the others from loading.

The [plugin guide](docs/local-plugins.md) has a minimal example, supported imports, and instructions for native helpers.

## Defaults

Plugin announcement popups are disabled for everyone, including existing profiles. You can browse the catalog yourself in Settings.

Experiments is enabled by default on new profiles. Your saved choices still apply when upgrading.

Chromium ships with English language resources. Discord's own interface language is still your choice.

## Developer Portal

Enable Developer Mode under Discord Settings → Advanced. A Developer Portal entry appears at the bottom of Settings. Select it, then click **Open Developer Portal**.

It loads the real Discord Developer Portal inside Excord. **Back to Excord** returns to your existing chat session.

## Development

Requires Bun 1.4+ and Node 22+.

```sh
bun install --frozen-lockfile
bun run start
```

Run the checks with:

```sh
bun run check
bun run typecheck:reference
```

`bun run check` uses [ts-rust](https://github.com/pingdotgg/ts-rust) for type checking and runs the tests. The reference check uses TypeScript's compiler.

Read the [performance measurements](docs/performance.md), [app size results](docs/app-size.md), and [compatibility notes](docs/compatibility.md) for what we've measured and how the bundled runtime works. The [release guide](docs/releases.md) covers packaging and distribution.

## Credits and license

Excord is GPL-3.0-or-later. The desktop code comes from [Equibop](https://github.com/Equicord/Equibop) and [Vesktop](https://github.com/Vencord/Vesktop). The bundled plugin runtime comes from [Equicord](https://github.com/Equicord/Equicord) and [Vencord](https://github.com/Vendicated/Vencord).

The original copyright notices remain in the source files. [upstream.lock.json](upstream.lock.json) records the bundled revisions. Excord is an independent project.
