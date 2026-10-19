import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { load } from "js-yaml";

const version = JSON.parse(await readFile("package.json", "utf8")).version;
const filename = process.platform === "darwin" ? "latest-mac.yml" : "latest.yml";
const metadata = load(await readFile(join("dist", filename), "utf8")) as {
    version: string; files: { url: string; sha512: string; }[];
};
assert.equal(metadata.version, version);
assert.ok(metadata.files.length > 0, "Update metadata must reference an artifact");
for (const file of metadata.files) {
    assert.match(file.sha512, /^[A-Za-z0-9+/]{86}==$/, "Updater artifacts need SHA-512 integrity");
    assert.ok(!file.url.includes("/") && !file.url.includes("\\"), "Artifacts must be release filenames");
    await access(join("dist", decodeURIComponent(file.url)));
}
if (process.platform === "darwin") assert.ok(metadata.files.some(file => file.url.endsWith(".zip")), "Mac updates require the ZIP");
console.log(`Verified ${filename} for ${version}`);
