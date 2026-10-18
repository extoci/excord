# Excord

Excord wraps Discord's website in an opinionated desktop app. The first version targets Apple silicon Macs and Windows x64. It bundles Equicord's plugin catalog and adds local TypeScript plugin folders that rebuild when you refresh.

This is an early implementation. It retains Equicord's plugin manager and Webpack patcher for compatibility, and derives its desktop integration from Equibop and Vesktop. It is not a completed rewrite of those projects. See `upstream.lock.json` for the exact source revisions.

## Develop

Install Bun 1.4 or later and Node 22 or later, then run:

```sh
bun install --frozen-lockfile
bun run build
bun run start
```

`bun run typecheck` uses `tsc-rs` from pingdotgg/ts-rust. `bun run typecheck:reference` cross-checks with TypeScript. Run `bun test tests` for the local compiler and origin checks.

## Local plugins

Open Excord Settings and create a plugin, or put a folder containing `index.ts` or `index.tsx` in Excord's plugins directory. Use the Vencord plugin API. Press Cmd+R or Ctrl+R to compile changed folders and reload the page. Excord reports compilation and loading errors in its settings page.

Plugins execute in your Discord session. A plugin with `native.ts` can also execute Node code on your computer. Only install code you trust.

## Credits and license

Excord is GPL-3.0-or-later. The desktop code derives from [Equibop](https://github.com/Equicord/Equibop) and [Vesktop](https://github.com/Vencord/Vesktop). The bundled modification runtime derives from [Equicord](https://github.com/Equicord/Equicord) and [Vencord](https://github.com/Vendicated/Vencord). Original copyright notices remain in their source files. Excord is independent of those projects and Discord.
