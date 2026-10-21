import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { X509Certificate } from "node:crypto";
import { createRequire } from "node:module";

const { load } = createRequire(import.meta.url)("js-yaml") as { load(source: string): unknown; };

assert.equal(process.platform, "darwin", "Mac update signatures must be verified on macOS");
const app = resolve("dist/mac-arm64/Excord.app");
function signature(appPath: string) {
    const result = spawnSync("codesign", ["--display", "--verbose=4", "--requirements", "-", appPath], { encoding: "utf8" });
    assert.equal(result.status, 0, "Could not inspect the Mac app's signature");
    return `${result.stdout}\n${result.stderr}`;
}
const details = signature(app);
assert.match(details, /^Authority=Excord Updates$/m, "Release updates need the persistent certificate, not ad-hoc signing");
const requirement = details.match(/^designated => (.+)$/m)?.[1];
assert.ok(requirement && !/\bcdhash\b/.test(requirement), "The update signing requirement must survive changes to the app's contents");
execFileSync("codesign", ["--verify", "--deep", "--strict", app]);

// Squirrel checks the ZIP's app against the installed app's requirement. Checking
// only `codesign --verify` permits two individually valid but incompatible apps.
// An optional previous signed app exercises the actual cross-version requirement.
const previous = process.argv[2] ? resolve(process.argv[2]) : app;
const previousRequirement = signature(previous).match(/^designated => (.+)$/m)?.[1];
assert.ok(previousRequirement, "The previous app must have a designated requirement");
const metadata = load(await readFile("dist/latest-mac.yml", "utf8")) as { files: { url: string; }[]; };
const zip = metadata.files.find(file => file.url.endsWith(".zip"))?.url;
assert.ok(zip && !/[\\/]/.test(zip), "Mac update metadata must reference a release ZIP filename");
const directory = await mkdtemp(join(tmpdir(), "excord-update-signature-"));
try {
    assert.ok(process.env.EXCORD_MAC_SIGNING_CERTIFICATE, "The expected public signing certificate must be provided");
    const expectedCertificate = new X509Certificate(await readFile(process.env.EXCORD_MAC_SIGNING_CERTIFICATE));
    const prefix = join(directory, "signer-");
    execFileSync("codesign", ["--display", "--extract-certificates", prefix, app]);
    const actualCertificate = new X509Certificate(await readFile(`${prefix}0`));
    assert.equal(actualCertificate.fingerprint256, expectedCertificate.fingerprint256, "The app must use the configured release certificate");
    execFileSync("ditto", ["-x", "-k", resolve("dist", decodeURIComponent(zip)), directory]);
    execFileSync("codesign", ["--verify", "--deep", "--strict", "--test-requirement", previousRequirement, join(directory, "Excord.app")]);
} finally {
    await rm(directory, { recursive: true, force: true });
}
console.log("Verified persistent signing certificate and updater ZIP signing compatibility");
