import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDiagnosticReport } from "../src/excord/diagnosticReport";
import {
  backupSettingsForReset,
  readSettingsFile,
  writeSettingsFile,
} from "../src/main/utils/settingsFile";

const temporary: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "excord recovery "));
  temporary.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("profile recovery", () => {
  test("backs up malformed settings before replacing them with defaults", async () => {
    const path = await directory();
    const file = join(path, "settings.json");
    await writeFile(file, '{"unfinished":');
    expect(readSettingsFile(file)).toEqual({});
    const backup = (await readdir(path)).find((name) => name.endsWith(".bak"))!;
    writeSettingsFile(file, { tray: true });
    expect(await readFile(join(path, backup), "utf8")).toBe('{"unfinished":');
    expect(readSettingsFile(file)).toEqual({ tray: true });
    expect((await readdir(path)).some((name) => name.endsWith(".tmp"))).toBe(
      false,
    );
  });
  test("rejects null, arrays, and scalar settings without losing the originals", async () => {
    const path = await directory();
    for (const [index, value] of [null, [], 12, "bad"].entries()) {
      const file = join(path, `${index}.json`);
      await writeFile(file, JSON.stringify(value));
      expect(readSettingsFile(file)).toEqual({});
      expect(await readFile(file, "utf8")).toBe(JSON.stringify(value));
    }
  });
  test("an unsuccessful save leaves the previous valid settings intact", async () => {
    const file = join(await directory(), "settings.json");
    writeSettingsFile(file, { tray: true });
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => writeSettingsFile(file, cycle)).toThrow();
    expect(readSettingsFile(file)).toEqual({ tray: true });
  });
  test("reset preserves plugin source and themes, and backs up settings and QuickCSS", async () => {
    const path = await directory();
    for (const file of [
      "settings.json",
      "state.json",
      "settings/settings.json",
      "settings/quickCss.css",
      "plugins/personal/index.ts",
      "themes/personal.css",
    ]) {
      await mkdir(join(path, file, ".."), { recursive: true });
      await writeFile(join(path, file), file);
    }
    const backup = backupSettingsForReset(path);
    expect(await readFile(join(backup, "settings.json"), "utf8")).toBe(
      "settings.json",
    );
    expect(await readFile(join(backup, "settings/quickCss.css"), "utf8")).toBe(
      "settings/quickCss.css",
    );
    expect(
      await readFile(join(path, "plugins/personal/index.ts"), "utf8"),
    ).toBe("plugins/personal/index.ts");
    expect(await readFile(join(path, "themes/personal.css"), "utf8")).toBe(
      "themes/personal.css",
    );
    expect((await readdir(path)).includes("state.json")).toBe(false);
  });
});

test("diagnostics exclude plugin source, paths, identifiers, raw errors, and extra properties", () => {
  const secret = "private-account-token-and-path";
  const report = createDiagnosticReport(
    {
      startupMs: 100,
      uptimeSeconds: 2,
      processes: [{ type: "Browser", cpuPercent: 0, memoryMiB: 30 }],
      upstream: { version: "1", commit: "abc" },
      localPlugins: {
        plugins: [
          {
            folder: secret,
            code: secret,
            nativePath: secret,
            cacheHit: true,
            durationMs: 3,
          },
        ],
        issues: [{ folder: secret, message: secret, phase: "native" }],
        preparedAt: secret,
        durationMs: 3,
      },
    },
    {
      version: "0.1.1-alpha.1",
      revision: "abc",
      electron: "43",
      chromium: "x",
      platform: "win32",
      architecture: "x64",
      osRelease: "10",
      safeMode: false,
      packaged: true,
      extra: secret,
    } as Parameters<typeof createDiagnosticReport>[1],
    [],
  );
  expect(JSON.stringify(report)).not.toContain(secret);
  expect(report.localPlugins.prepared).toBe(1);
  expect(report.localPlugins.issues.native).toBe(1);
});
