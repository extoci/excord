import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createPrivateKey, X509Certificate } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const credentials = {
    CSC_LINK: "test-certificate.p12",
    CSC_KEY_PASSWORD: "test-password",
    CSC_IDENTITY_AUTO_DISCOVERY: "true"
};
function releaseConfig(overrides: Record<string, string> = {}) {
    return spawnSync(process.execPath, ["-e", 'console.log(JSON.stringify(require("./scripts/build/mac-release.cjs")()))'], {
        cwd: new URL("..", import.meta.url), encoding: "utf8", env: { ...process.env, ...credentials, ...overrides }
    });
}
test("closed-alpha releases require persistent certificate signing without an Apple membership", () => {
    const result = releaseConfig();
    expect(result.status).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(config.mac.identity).toBe("Excord Updates");
    expect(config.forceCodeSigning).toBe(true);
    expect(config.mac.hardenedRuntime).toBe(false);
    expect(config.mac.notarize).toBe(false);
    expect(config.mac.timestamp).toBe("none");
    expect(config.appId).toBe("app.excord.desktop");
    expect(config.mac.target).toContainEqual({ target: "zip", arch: ["arm64"] });
});
test("release packaging fails before building when the persistent certificate is missing", () => {
    for (const name of Object.keys(credentials).filter(name => name !== "CSC_IDENTITY_AUTO_DISCOVERY")) {
        const result = releaseConfig({ [name]: "" });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(`Mac releases require ${name}.`);
        expect(result.stderr).not.toContain(credentials.CSC_KEY_PASSWORD);
    }
    const result = releaseConfig({ CSC_IDENTITY_AUTO_DISCOVERY: "false" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CSC_IDENTITY_AUTO_DISCOVERY=true");
});
test.skipIf(process.platform === "win32")("the one-time certificate generator creates a usable private identity and refuses to replace it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "excord-certificate-test-"));
    const identityDirectory = join(directory, "identity");
    const args = ["--import", "tsx", resolve("scripts/create-mac-update-certificate.mts"), identityDirectory];
    try {
        const created = spawnSync("node", args, { encoding: "utf8" });
        expect(created.status).toBe(0);
        const certificate = new X509Certificate(await readFile(join(identityDirectory, "certificate.pem")));
        expect(certificate.subject).toContain("CN=Excord Updates");
        expect(certificate.keyUsage).toContain("1.3.6.1.5.5.7.3.3");
        expect(certificate.verify(certificate.publicKey)).toBe(true);
        expect(certificate.checkPrivateKey(createPrivateKey(await readFile(join(identityDirectory, "key.pem"))))).toBe(true);
        const archive = join(identityDirectory, "identity.p12");
        const passwordFile = join(identityDirectory, "password.txt");
        const archiveCheck = spawnSync("openssl", ["pkcs12", "-in", archive, "-passin", `file:${passwordFile}`, "-info", "-noout"], { encoding: "utf8" });
        expect(archiveCheck.status).toBe(0);
        if (process.platform !== "win32") {
            for (const file of [archive, passwordFile, join(identityDirectory, "key.pem")])
                expect((await stat(file)).mode & 0o777).toBe(0o600);
        }
        const repeated = spawnSync("node", args, { encoding: "utf8" });
        expect(repeated.status).not.toBe(0);
        expect(new X509Certificate(await readFile(join(identityDirectory, "certificate.pem"))).fingerprint256).toBe(certificate.fingerprint256);
        const password = await readFile(passwordFile, "utf8");
        expect(created.stdout + created.stderr + repeated.stdout + repeated.stderr).not.toContain(password);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 15000);
