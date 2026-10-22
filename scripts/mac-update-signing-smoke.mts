import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, X509Certificate } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

assert.ok(process.platform === "darwin" && process.env.CI === "true", "Signing smoke tests require a disposable Mac CI runner");
const directory = await mkdtemp(join(tmpdir(), "excord-signing-smoke-"));
const identityDirectory = join(directory, "identity");
const keychain = join(directory, "test.keychain-db");
const keychainPassword = randomBytes(32).toString("base64url");
let createdKeychain = false;
let previousKeychains: string[] | undefined;
function command(file: string, args: string[], env = process.env) {
    console.log(`[signing] ${file === process.execPath ? "node" : file} ${args[0]}`);
    return execFileSync(file, args, { encoding: "utf8", env, stdio: "pipe", timeout: 60000 });
}
function requirement(app: string) {
    const result = spawnSync("codesign", ["--display", "--requirements", "-", app], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0);
    const output = `${result.stdout}\n${result.stderr}`;
    // codesign prefixes an implicit ad-hoc requirement with a comment marker.
    const value = output.match(/^(?:#\s*)?designated => (.+)$/m)?.[1];
    assert.ok(value, `Could not read codesign's designated requirement: ${output}`);
    return value;
}
function verify(app: string, required: string) {
    // '=' marks an inline expression; otherwise codesign treats it as a file.
    return spawnSync("codesign", ["--verify", "--strict", "--test-requirement", `=${required}`, app], { encoding: "utf8", timeout: 30000 });
}
try {
    const apps: string[] = [];
    for (const version of ["1.0.0", "1.0.1"]) {
        const app = join(directory, `${version}.app`);
        await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
        await copyFile("/usr/bin/true", join(app, "Contents", "MacOS", "fixture"));
        await writeFile(join(app, "Contents", "Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict>
            <key>CFBundleIdentifier</key><string>app.excord.signing-test</string>
            <key>CFBundleExecutable</key><string>fixture</string><key>CFBundlePackageType</key><string>APPL</string>
            <key>CFBundleVersion</key><string>${version}</string></dict></plist>`);
        command("codesign", ["--force", "--sign", "-", app]);
        command("codesign", ["--verify", "--strict", app]);
        apps.push(app);
    }
    const [installed, updated] = apps;
    const rejected = verify(updated, requirement(installed));
    assert.notEqual(rejected.status, 0, "Two individually valid ad-hoc builds must reproduce the update failure");
    assert.match(rejected.stderr, /code failed to satisfy specified code requirement/);

    // This certificate is a throwaway fixture, not the persistent release key.
    command(process.execPath, ["--import", "tsx", resolve("scripts/create-mac-update-certificate.mts"), identityDirectory]);
    const password = await readFile(join(identityDirectory, "password.txt"), "utf8");
    const certificate = new X509Certificate(await readFile(join(identityDirectory, "certificate.pem")));
    command(process.execPath, ["--import", "tsx", resolve("scripts/trust-mac-update-certificate.mts")], {
        ...process.env, RUNNER_TEMP: directory,
        CSC_LINK: (await readFile(join(identityDirectory, "identity.p12"))).toString("base64"), CSC_KEY_PASSWORD: password
    });
    command("security", ["create-keychain", "-p", keychainPassword, keychain]);
    createdKeychain = true;
    command("security", ["unlock-keychain", "-p", keychainPassword, keychain]);
    previousKeychains = [...command("security", ["list-keychains", "-d", "user"]).matchAll(/"([^"]+)"/g)].map(match => match[1]);
    command("security", ["list-keychains", "-d", "user", "-s", keychain, ...previousKeychains]);
    command("security", ["import", join(identityDirectory, "identity.p12"), "-k", keychain, "-P", password, "-T", "/usr/bin/codesign"]);
    command("security", ["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychain]);
    const fingerprint = certificate.fingerprint.replaceAll(":", "");
    const identities = command("security", ["find-identity", "-v", "-p", "codesigning", keychain]);
    if (!identities.includes(fingerprint)) {
        const diagnostics = command("security", ["find-identity", "-p", "codesigning", keychain]);
        throw new Error(`The fixture signing identity must be available: ${identities}\n${diagnostics}`);
    }
    for (const app of apps)
        command("codesign", ["--force", "--sign", fingerprint, "--keychain", keychain, "--timestamp=none", app]);
    const prefix = join(directory, "signer-");
    command("codesign", ["--display", `--extract-certificates=${prefix}`, installed]);
    const extractedCertificate = new X509Certificate(await readFile(`${prefix}0`));
    assert.equal(extractedCertificate.fingerprint256, certificate.fingerprint256);
    const stableRequirement = requirement(installed);
    assert.ok(!/\bcdhash\b/.test(stableRequirement));
    assert.equal(verify(updated, stableRequirement).status, 0, "A changed build signed with the same self-signed certificate must update");
    command("codesign", ["--force", "--sign", "-", updated]);
    assert.notEqual(verify(updated, stableRequirement).status, 0, "An update from another signing identity must still be rejected");
    console.log("Verified ad-hoc update rejection and persistent self-signed update compatibility");
} finally {
    const cleanup: (() => void | Promise<void>)[] = [];
    if (previousKeychains) {
        const searchList = previousKeychains;
        cleanup.push(() => { command("security", ["list-keychains", "-d", "user", "-s", ...searchList]); });
    }
    if (createdKeychain) cleanup.push(() => { command("security", ["delete-keychain", keychain]); });
    // The public fixture trust disappears with the disposable runner. Its
    // private key is removed above, so release signing cannot select this key.
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    for (const action of cleanup) {
        try { await action(); }
        catch { console.error("Could not clean up a signing smoke-test fixture"); process.exitCode = 1; }
    }
}
