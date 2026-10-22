import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

assert.ok(process.argv[2], "Pass a new private directory outside the repository for the signing identity");
const directory = resolve(process.argv[2]);
// Refuse to overwrite an existing identity. Regenerating it breaks update trust.
await mkdir(directory, { mode: 0o700 });
const password = randomBytes(32).toString("base64url");
const passwordFile = join(directory, "password.txt");
await writeFile(passwordFile, password, { mode: 0o600, flag: "wx" });
const config = join(directory, "certificate.cnf");
await writeFile(config, `[req]
distinguished_name = subject
x509_extensions = code_signing
prompt = no
[subject]
CN = Excord Updates
O = Excord
[code_signing]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
`);
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:3072", "-nodes", "-sha256", "-days", "3650",
    "-config", config,
    "-keyout", join(directory, "key.pem"), "-out", join(directory, "certificate.pem")], { stdio: "pipe" });
// 3DES PKCS#12 encryption is compatible with macOS security import, including
// archives created with OpenSSL 3 on Linux. The signing key itself is RSA/SHA-256.
execFileSync("openssl", ["pkcs12", "-export", "-inkey", join(directory, "key.pem"), "-in", join(directory, "certificate.pem"),
    "-name", "Excord Updates", "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1",
    "-passout", `file:${passwordFile}`, "-out", join(directory, "identity.p12")], { stdio: "pipe" });
await chmod(join(directory, "key.pem"), 0o600);
await chmod(join(directory, "identity.p12"), 0o600);
console.log(`Created the persistent Excord signing identity in ${directory}. Back it up securely and reuse it for every release. No GitHub changes were made.`);
