import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { optimizePatcher } from "./build/optimizePatcher.mts";

const [corpusFile, output = "test-results/patcher-benchmark.json"] =
  process.argv.slice(2);
assert.ok(
  corpusFile,
  "Pass a corpus captured with bench-runtime.mts --corpus <file>",
);
const input = await readFile(corpusFile, "utf8");
const corpus = JSON.parse(input) as {
  buildNumber: number;
  historicalFindStrings: string[];
  sources: string[];
  patches: { find: string | { source: string; flags: string } }[];
};
assert.ok(
  Array.isArray(corpus.historicalFindStrings),
  "Capture the candidate historical string index before benchmarking",
);
const source = await readFile(
  "vendor/equicord/src/webpack/patchWebpack.ts",
  "utf8",
);
const patterns = corpus.patches.map((p) =>
  typeof p.find === "string" ? p.find : new RegExp(p.find.source, p.find.flags),
);
const sources = corpus.sources.filter(
  (text) =>
    !text.includes("[native code]") &&
    !patterns.some((pattern) => {
      if (typeof pattern === "string") return text.includes(pattern);
      pattern.lastIndex = 0;
      return pattern.test(text);
    }),
);
assert.ok(
  sources.length > 100,
  "The corpus must contain real module-factory misses",
);
const factories = sources.map((text) => ({ toString: () => text }));
const historySeedMs: Record<string, number> = {};
const variants: {
  label: string;
  patch: (id: number, factory: object) => unknown;
}[] = [];
for (const label of ["original", "optimized"]) {
  const code = (
    label === "optimized"
      ? optimizePatcher(source, resolve("src/excord/patchPrefilter.ts"))
      : source
  ).replace(/^import .+;$/gm, (line) =>
    line.includes("PatchPrefilter") ? line : "",
  );
  const result = await build({
    stdin: {
      contents: `
const Settings={eagerPatches:false}, reporterData={};
class Logger{info(){}warn(){}error(){}debug(){}}
const makeLazy=fn=>{let cache;return()=>cache??=fn();};
const traceFunctionWithResults=(_name,fn)=>(...args)=>[fn(...args),0];
const interpolateIfDefined=()=>'';
const wreq={m:{927815:function(){console.warn("Trying to open a changelog for an invalid build number ${corpus.buildNumber}");}}};
const findModuleFactory=()=>undefined;
${code}
${label === "optimized" ? 'export function seedHistory(strings){ excordPatchPrefilter.couldMatch("__history_seed__", strings.map(find=>({find}))); }' : ""}
export {patchFactory};export const regexp=(source,flags)=>new RegExp(source,flags);`,
      loader: "ts",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    define: {
      IS_DEV: "false",
      IS_REPORTER: "false",
      IS_COMPANION_TEST: "false",
    },
  });
  const module = { exports: {} as any };
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
  });
  if (label === "optimized") {
    const start = performance.now();
    module.exports.seedHistory(corpus.historicalFindStrings);
    historySeedMs[label] = performance.now() - start;
  }
  module.exports.patches.push(
    ...corpus.patches.map((p, i) => ({
      plugin: `probe-${i}`,
      replacement: [],
      find:
        typeof p.find === "string"
          ? p.find
          : module.exports.regexp(p.find.source, p.find.flags),
    })),
  );
  variants.push({ label, patch: module.exports.patchFactory });
}
const run = (variant: (typeof variants)[number]) => {
  const start = performance.now();
  for (let i = 0; i < factories.length; i++) variant.patch(i, factories[i]);
  return performance.now() - start;
};
const cold = Object.fromEntries(variants.map((v) => [v.label, run(v)]));
for (const v of variants) for (let i = 0; i < 3; i++) run(v);
const samples: Record<string, number[]> = { original: [], optimized: [] };
for (let round = 0; round < 20; round++)
  for (const variant of round % 2 ? [...variants].reverse() : variants)
    samples[variant.label].push(run(variant));
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medians = Object.fromEntries(
  Object.entries(samples).map(([name, values]) => [name, median(values)]),
);
const report = {
  scope:
    "Actual pinned patchFactory negative-match path on captured Discord module text; excludes replacement execution and whole-app startup",
  corpusSha256: createHash("sha256").update(input).digest("hex"),
  buildNumber: corpus.buildNumber,
  availableFactories: corpus.sources.length,
  missFactories: sources.length,
  patchCount: corpus.patches.length,
  historicalStringCount: corpus.historicalFindStrings.length,
  historySeedMs,
  coldMs: cold,
  samplesMs: samples,
  medianMs: medians,
  speedup: medians.original / medians.optimized,
};
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    missFactories: sources.length,
    patchCount: corpus.patches.length,
    coldMs: cold,
    medianMs: medians,
    speedup: report.speedup,
  }),
);
