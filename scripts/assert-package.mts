import assert from "node:assert/strict";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { listPackage, extractFile } = require("@electron/asar") as { listPackage(path: string): string[]; extractFile(path: string, file: string): Buffer };
const archive = resolve(process.argv[2] ?? (process.platform === "darwin" ? "dist/mac-arm64/Excord.app/Contents/Resources/app.asar"
    : process.platform === "win32" ? "dist/win-unpacked/resources/app.asar" : "dist/linux-unpacked/resources/app.asar"));
const entries = new Set(listPackage(archive).map(path => path.replaceAll("\\", "/")));
for (const file of ["dist/js/main.js", "dist/js/preload.js", "dist/js/renderer.js", "dist/js/arRpcWorker.js",
    "static/runtime/main.js", "static/runtime/preload.js", "static/runtime/renderer.js", "static/runtime/renderer.css",
    "static/runtime/modules.json", "static/runtime/THIRD_PARTY_LICENSES.txt", "dist/js/THIRD_PARTY_LICENSES.txt",
    "node_modules/esbuild/lib/main.js", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(entries.has(`/${file}`), `The release is missing ${file}`);
}
const desktopNotices = extractFile(archive, join("dist", "js", "THIRD_PARTY_LICENSES.txt")).toString();
assert.match(desktopNotices, /Copyright \(c\) 2022 OpenAsar/, "The RPC worker's license notice must accompany its bundled code");
assert.match(desktopNotices, /Permission is hereby granted/);
assert.ok(![...entries].some(path => /arrpc-bun|\/static\/dist\/arrpc-/.test(path)), "A standalone RPC runtime must not ship");
const executable = process.platform === "win32" ? `@esbuild/win32-${process.arch}/esbuild.exe` : `@esbuild/${process.platform}-${process.arch}/bin/esbuild`;
const binary = join(`${archive}.unpacked`, "node_modules", executable);
await access(binary);
const report = { archiveBytes: (await stat(archive)).size, compilerBinaryBytes: (await stat(binary)).size,
    entries: entries.size, platform: process.platform, architecture: process.arch, hasStandaloneRpcRuntime: false };
await mkdir("test-results", { recursive: true });
await writeFile("test-results/package.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
