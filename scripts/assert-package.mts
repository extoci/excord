import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, lstat, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { listPackage, extractFile } = require("@electron/asar") as { listPackage(path: string): string[]; extractFile(path: string, file: string): Buffer };
const archive = resolve(process.argv[2] ?? (process.platform === "darwin" ? "dist/mac-arm64/Excord.app/Contents/Resources/app.asar"
    : process.platform === "win32" ? "dist/win-unpacked/resources/app.asar" : "dist/linux-unpacked/resources/app.asar"));
const entries = new Set(listPackage(archive).map(path => path.replaceAll("\\", "/")));
for (const file of ["dist/js/main.js", "dist/js/preload.js", "dist/js/renderer.js", "dist/js/arRpcWorker.js",
    "static/runtime/main.js", "static/runtime/preload.js", "static/runtime/renderer.js", "static/runtime/renderer.css",
    "static/runtime/modules.json", "static/runtime/THIRD_PARTY_LICENSES.txt", "dist/js/THIRD_PARTY_LICENSES.txt",
    "node_modules/esbuild/lib/main.js", "static/views/offline.html", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(entries.has(`/${file}`), `The release is missing ${file}`);
}
const desktopNotices = extractFile(archive, join("dist", "js", "THIRD_PARTY_LICENSES.txt")).toString();
assert.match(desktopNotices, /Copyright \(c\) 2022 OpenAsar/, "The RPC worker's license notice must accompany its bundled code");
assert.match(desktopNotices, /Permission is hereby granted/);
assert.ok(![...entries].some(path => /arrpc-bun|\/static\/dist\/arrpc-/.test(path)), "A standalone RPC runtime must not ship");
assert.ok(![...entries].some(path => path.endsWith(".map")), "Debug source maps belong in the separate CI artifact, not the app");
assert.ok(!entries.has("/static/runtime/bundle-report.json"), "Build reports must not ship in the app");
const executable = process.platform === "win32" ? `@esbuild/win32-${process.arch}/esbuild.exe` : `@esbuild/${process.platform}-${process.arch}/bin/esbuild`;
const binary = join(`${archive}.unpacked`, "node_modules", executable);
await access(binary);

// Logical regular-file bytes, excluding symlinks and filesystem allocation overhead.
// Keep the runtime and unpacked compiler in this total so ASAR savings cannot hide growth elsewhere.
const appDirectory = resolve(dirname(archive), process.platform === "darwin" ? "../.." : "..");
if (process.platform === "darwin") {
    const description = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :NSAudioCaptureUsageDescription", join(appDirectory, "Contents/Info.plist")], { encoding: "utf8" });
    assert.match(description, /Excord/, "The Mac package must declare system audio capture access");
}
async function inventory(directory: string): Promise<{ path: string; bytes: number }[]> {
    const files: { path: string; bytes: number }[] = [];
    for (const name of await readdir(directory)) {
        const path = join(directory, name);
        const info = await lstat(path);
        if (info.isDirectory()) files.push(...await inventory(path));
        else if (info.isFile()) files.push({ path: relative(appDirectory, path).replaceAll("\\", "/"), bytes: info.size });
    }
    return files;
}
const files = await inventory(appDirectory);
const localeFiles = files.filter(file => /(?:^|\/)locales\/[^/]+\.pak$|\.lproj\//.test(file.path));
assert.ok(localeFiles.some(file => /(?:\/en-US\.pak|\/en\.lproj\/locale\.pak|\/en_US\.lproj\/locale\.pak)$/.test(file.path)),
    "The English Chromium locale must ship so the packaged app can start");
for (const file of localeFiles) {
    const language = file.path.match(/(?:^|\/)locales\/([^/]+)\.pak$/)?.[1] ?? file.path.match(/(?:^|\/)([^/]+)\.lproj\//)?.[1];
    assert.match(language!, /^en(?:[-_]US)?$/i, `Unexpected Chromium language resource: ${file.path}`);
}
assert.ok(files.some(file => file.path.endsWith("LICENSES.chromium.html") && file.bytes > 0), "Chromium license notices must ship");
const artifacts: { name: string; bytes: number }[] = [];
for (const name of await readdir("dist")) {
    if (/^Excord.*\.(zip|dmg|exe|AppImage)$/.test(name)) artifacts.push({ name, bytes: (await stat(join("dist", name))).size });
}
const report = { archiveBytes: (await stat(archive)).size, compilerBinaryBytes: (await stat(binary)).size,
    entries: entries.size, platform: process.platform, architecture: process.arch, hasStandaloneRpcRuntime: false,
    electronVersion: JSON.parse(await readFile("node_modules/electron/package.json", "utf8")).version,
    installedFileBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    largestFiles: files.sort((a, b) => b.bytes - a.bytes).slice(0, 10), artifacts,
    localeFiles, localeBytes: localeFiles.reduce((sum, file) => sum + file.bytes, 0),
    hasSourceMaps: false };
await mkdir("test-results", { recursive: true });
await writeFile("test-results/package.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
