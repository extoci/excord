import assert from "node:assert/strict";

function replaceOnce(source: string, before: string, after: string) {
  assert.equal(
    source.split(before).length,
    2,
    "The pinned Equicord patcher changed; review the optimization before upgrading.",
  );
  return source.replace(before, after);
}

/** Keep the pinned vendor tree intact and make the exact modification reviewable. */
export function optimizePatcher(source: string, prefilter: string): string {
  source = source.replace(/\r\n/g, "\n");
  source = replaceOnce(
    source,
    "export const patches = [] as Patch[];",
    `import { PatchPrefilter } from ${JSON.stringify(prefilter)};\nconst excordPatchPrefilter = new PatchPrefilter();\nexport const patches = [] as Patch[];`,
  );
  const buildCheck = `        const buildNumber = getBuildNumber();
        const shouldCheckBuildNumber = buildNumber !== -1;

        if (
            shouldCheckBuildNumber &&
            ((patch.fromBuild != null && buildNumber < patch.fromBuild) || (patch.toBuild != null && buildNumber > patch.toBuild))
        ) {
            patches.splice(i--, 1);
            continue;
        }
`;
  source = replaceOnce(source, buildCheck, "");
  source = replaceOnce(
    source,
    "    const originalFactoryCode = String(originalFactory);",
    `    const originalFactoryCode = String(originalFactory);
    const buildNumber = patches.length ? getBuildNumber() : -1;
    const shouldCheckBuildNumber = buildNumber !== -1;
    if (shouldCheckBuildNumber) {
        for (let i = patches.length - 1; i >= 0; i--) {
            const patch = patches[i];
            if ((patch.fromBuild != null && buildNumber < patch.fromBuild) || (patch.toBuild != null && buildNumber > patch.toBuild)) patches.splice(i, 1);
        }
    }
    if (!excordPatchPrefilter.couldMatch(originalFactoryCode, patches)) {
        originalFactory[SYM_ORIGINAL_FACTORY] = originalFactory;
        return originalFactory as PatchedModuleFactory;
    }`,
  );
  return source;
}
