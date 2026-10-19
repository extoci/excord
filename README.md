# Excord

Excord wraps Discord's website in an opinionated desktop app. The first version targets Apple silicon Macs and Windows x64. It bundles Equicord's plugin catalog and adds local TypeScript plugin folders that rebuild when you refresh.

This is an early implementation. It retains Equicord's plugin manager and Webpack patcher for compatibility, and derives its desktop integration from Equibop and Vesktop. It is not a completed rewrite of those projects. See `upstream.lock.json` for the exact source revisions.

The 0.1.1-alpha.2 candidate adds activity-aware background scheduling and a patch-matching optimization, alongside recovery controls and installer verification. Read the [alpha guide](docs/closed-alpha.md) and [device checklist](docs/alpha-checklist.md) before inviting testers. Builds remain in private drafts in [GitHub Releases](https://github.com/extoci/excord/releases).

Native CI comparisons against the previous Excord build measured 97.3% less CPU on Windows and 98.7% less on Mac for a hidden animation workload. The patch-miss replay took 56% less time on Windows and 59% less on Mac, with the catalog enabled. These are specific workload results. Overall startup and RAM advantages are unproven. Read the [methods and raw measurements](docs/performance.md).

See the [measured app sizes](docs/app-size.md) for the current package-size reductions. Release builds include English Chromium resources only. Discord's interface language remains selectable; some browser menus and messages fall back to English.

## Develop

Install Bun 1.4 or later and Node 22 or later, then run:

```sh
bun install --frozen-lockfile
bun run build
bun run start
```

`bun run typecheck` uses `tsc-rs` from pingdotgg/ts-rust. `bun run typecheck:reference` cross-checks with TypeScript. Run `bun test tests` for the local compiler and origin checks.

After a build, `bun run test:rpc` checks the optional RPC worker. `bun run test:electron` exercises local plugins against the real Discord login page. GitHub Actions runs both on native Apple silicon and Windows runners, builds installers, and repeats plugin checks from the packaged archive.

## Local plugins

Open Excord Settings and create a plugin, or put a folder containing `index.ts` or `index.tsx` in Excord's plugins directory. Use the Vencord plugin API. Press Cmd+R or Ctrl+R to compile changed folders and reload the page. Excord reports compilation and loading errors in its settings page.

Plugins execute in your Discord session. A plugin with `native.ts` can also execute Node code on your computer. Only install code you trust.

Read the [plugin guide](docs/local-plugins.md), [compatibility record](docs/compatibility.md), and [release instructions](docs/releases.md).

## Credits and license

Excord is GPL-3.0-or-later. The desktop code derives from [Equibop](https://github.com/Equicord/Equibop) and [Vesktop](https://github.com/Vencord/Vesktop). The bundled modification runtime derives from [Equicord](https://github.com/Equicord/Equicord) and [Vencord](https://github.com/Vendicated/Vencord). Original copyright notices remain in their source files. Excord is independent of those projects and Discord.
