import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";

// Only disposable Mac CI runners should add a self-signed root to their trust
// settings. Users installing Excord do not need to import this certificate.
assert.ok(process.platform === "darwin" && process.env.CI === "true" && process.env.RUNNER_TEMP,
    "Certificate trust setup is restricted to disposable macOS CI runners");
assert.ok(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD, "The persistent signing identity must be configured");
assert.match(process.env.CSC_LINK, /^[A-Za-z0-9+/=\s]+$/, "CSC_LINK must be the base64-encoded PKCS#12 identity");
const directory = await mkdtemp(join(tmpdir(), "excord-signing-import-"));
try {
    const archive = join(directory, "identity.p12");
    await writeFile(archive, Buffer.from(process.env.CSC_LINK, "base64"), { mode: 0o600 });
    const certificate = join(process.env.RUNNER_TEMP, "excord-update-certificate.pem");
    execFileSync("openssl", ["pkcs12", "-in", archive, "-clcerts", "-nokeys", "-passin", "env:CSC_KEY_PASSWORD", "-out", certificate], { stdio: "pipe", timeout: 30000 });
    const identity = new X509Certificate(await readFile(certificate));
    assert.ok(identity.subject.split("\n").includes("CN=Excord Updates"), "The certificate must identify Excord Updates");
    // electron-builder imports the private key into its temporary keychain.
    // Trust the public certificate first so security find-identity can select it.
    // User trust settings can open an authorization dialog on a headless runner.
    // Admin trust with noninteractive sudo avoids that dialog on disposable CI.
    console.log("[signing] Trusting the public certificate on the disposable runner");
    execFileSync("sudo", ["-n", "security", "add-trusted-cert", "-d", "-r", "trustRoot", "-p", "codeSign", "-k", "/Library/Keychains/System.keychain", certificate], { stdio: "pipe", timeout: 30000 });
} finally {
    await rm(directory, { recursive: true, force: true });
}
