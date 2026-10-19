import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { zipSync, type Zippable } from "fflate";

const [directory, revision, run] = process.argv.slice(2);
assert.ok(
  directory && /^[a-f0-9]{40}$/.test(revision ?? "") && /^\d+$/.test(run ?? ""),
  "Usage: node --import tsx scripts/prepare-alpha.mts <release-directory> <verified-source-SHA> <native-run-ID>",
);
const root = resolve(directory);
const sourceFile = (file: string) =>
  execFileSync("git", ["show", `${revision}:${file}`], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
const metadata = JSON.parse(sourceFile("package.json"));
const lock = JSON.parse(sourceFile("upstream.lock.json"));
assert.match(metadata.version, /^\d+\.\d+\.\d+-alpha\.\d+$/);
await mkdir(root, { recursive: true });
const sourceName = `Excord-${metadata.version}-source.tar.gz`;
execFileSync("git", [
  "archive",
  "--format=tar.gz",
  `--prefix=excord-${metadata.version}/`,
  `--output=${join(root, sourceName)}`,
  revision,
]);
const source = await readFile(join(root, sourceName));
const kits: { name: string; bytes: number; sha256: string }[] = [];
for (const platform of ["mac", "win"] as const) {
  const proofRoot = join(root, `verification-${platform}`);
  const packageProof = JSON.parse(
    await readFile(join(proofRoot, "package.json"), "utf8"),
  );
  const installProof = JSON.parse(
    await readFile(join(proofRoot, "installer-smoke.json"), "utf8"),
  );
  const recoveryProof = JSON.parse(
    await readFile(join(proofRoot, "recovery-smoke.json"), "utf8"),
  );
  const pluginProof = JSON.parse(
    await readFile(join(proofRoot, "electron-smoke.json"), "utf8"),
  );
  assert.equal(packageProof.platform, platform === "mac" ? "darwin" : "win32");
  assert.equal(installProof.results.length, 3);
  assert.ok(
    installProof.results.every(
      (item: { persistence: boolean; quit: boolean }) =>
        item.persistence && item.quit,
    ),
  );
  for (const field of [
    "safeMode",
    "profilePreserved",
    "offlineRecovery",
    "diagnosticsPrivate",
  ])
    assert.equal(recoveryProof[field], true, `${platform}: ${field}`);
  assert.deepEqual(pluginProof.errors, []);
  const powerProof = JSON.parse(
    await readFile(join(proofRoot, "power-smoke.json"), "utf8"),
  );
  for (const field of [
    "idleThrottling",
    "connectedRtcProtected",
    "hiddenRtcEcho",
    "hiddenAnimationPaused",
    "foregroundAnimationResumed",
    "settingAppliesImmediately",
    "subframeHasNoNativeBridge",
  ])
    assert.equal(powerProof[field], true, `${platform}: ${field}`);
  const installerName =
    platform === "mac"
      ? `Excord-${metadata.version}-mac-arm64.dmg`
      : `Excord-Setup-${metadata.version}-x64.exe`;
  const installer = await readFile(join(root, platform, installerName));
  assert.equal(
    packageProof.artifacts.find(
      (item: { name: string }) => item.name === installerName,
    )?.bytes,
    installer.length,
  );
  const contents: Record<string, Uint8Array> = {
    [installerName]: installer,
    [sourceName]: source,
    "README.md": Buffer.from(sourceFile("docs/closed-alpha.md")),
    "alpha-checklist.md": Buffer.from(sourceFile("docs/alpha-checklist.md")),
    "alpha-feedback.md": Buffer.from(sourceFile("docs/alpha-feedback.md")),
    "BUILD.json": Buffer.from(
      JSON.stringify(
        {
          schemaVersion: 1,
          version: metadata.version,
          sourceRevision: revision,
          platform: platform === "mac" ? "darwin" : "win32",
          architecture: platform === "mac" ? "arm64" : "x64",
          nativeVerification: `https://github.com/extoci/excord/actions/runs/${run}`,
          equicordRevision: lock.equicord.commit,
          signing:
            platform === "mac"
              ? "ad-hoc signed; no Developer ID or notarization"
              : "unsigned",
          updates: "manual closed alpha",
          verified: [
            "installer",
            "relaunch",
            "same-build reinstallation",
            "synthetic session persistence",
            "normal shutdown",
            "plugin refresh",
            "safe mode",
            "offline recovery",
            "diagnostics privacy",
            "hidden animation suspension and foreground resumption",
            "hidden local WebRTC data-channel echo",
            "immediate power setting changes",
            "main-frame-only native bridge",
          ],
          requiresDeviceVerification: [
            "Gatekeeper/SmartScreen",
            "account login",
            "calls",
            "camera",
            "screen sharing and system audio",
            "notifications",
            "tray",
            "sleep/wake",
          ],
        },
        null,
        2,
      ),
    ),
  };
  contents["SHA256SUMS"] = Buffer.from(
    Object.entries(contents)
      .map(
        ([name, data]) =>
          `${createHash("sha256").update(data).digest("hex")}  ${name}\n`,
      )
      .join(""),
  );
  const input: Zippable = {};
  for (const [name, data] of Object.entries(contents))
    input[name] = [
      data,
      {
        level:
          name.endsWith(".dmg") || name.endsWith(".exe") || name.endsWith(".gz")
            ? 0
            : 9,
      },
    ];
  const kit = zipSync(input);
  const name = `Excord-${metadata.version}-${platform}-${platform === "mac" ? "arm64" : "x64"}-alpha-kit.zip`;
  await writeFile(join(root, name), kit);
  kits.push({
    name,
    bytes: kit.length,
    sha256: createHash("sha256").update(kit).digest("hex"),
  });
}
await writeFile(
  join(root, "alpha-kits.json"),
  JSON.stringify({ version: metadata.version, revision, kits }, null, 2),
);
console.log(JSON.stringify(kits, null, 2));
