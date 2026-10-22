import { beforeAll, expect, test } from "bun:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

import { optimizePatcher } from "../scripts/build/optimizePatcher.mts";
import { PatchPrefilter } from "../src/excord/patchPrefilter";
import { createFavoritesPlugin } from "../src/excord/favorites";
import { factory as categoryFactory } from "./favorites-category-fixture";

test("the prefilter sees additions, replacements and regex state without consuming matches", () => {
  const filter = new PatchPrefilter();
  const patches: { find: string | RegExp }[] = [{ find: "a.[b]" }];
  expect(filter.couldMatch("unrelated module", patches)).toBe(false);
  expect(filter.couldMatch("a.[b]", patches)).toBe(true);
  patches[0].find = "new";
  expect(filter.couldMatch("new", patches)).toBe(true);
  expect(filter.couldMatch("a.[b]", patches)).toBe(false);
  expect(filter.getFindStrings()).toEqual(["new"]);
  patches.push({ find: /needle/g });
  const expression = patches[1].find as RegExp;
  expression.lastIndex = 90;
  expect(filter.couldMatch("needle", patches)).toBe(true);
  expect(expression.lastIndex).toBe(90);
  expect(filter.couldMatch("nothing here", patches)).toBe(false);
  expect(expression.lastIndex).toBe(0);
  patches[1].find = /x/y;
  expect(filter.couldMatch("anything", patches)).toBe(true);
  patches[1].find = Object.assign(/no/, {
    test() {
      throw Error("The prefilter must not invoke custom matchers");
    },
  });
  expect(filter.couldMatch("anything", patches)).toBe(true);
  patches[1].find = "";
  expect(filter.couldMatch("anything", patches)).toBe(true);
});

test("a prefilter miss never hides a string or regular-expression match", () => {
  const filter = new PatchPrefilter();
  const patterns = [
    "alpha",
    "a|b",
    "x.y",
    "[x]",
    "\\",
    "\n",
    "🦀",
    "a*b?",
    "(x)",
    "^$",
    /needle/i,
    /\d+/g,
  ];
  const patches = patterns.map((find) => ({ find }));
  for (let n = 0; n < 1000; n++) {
    const source = `module${n % 7 ? n : ""}:${patterns[n % patterns.length]}:${n % 3 ? "missing" : "NEEDLE"}`;
    const expected = patterns.some((pattern) => {
      if (typeof pattern === "string") return source.includes(pattern);
      const copy = new RegExp(pattern.source, pattern.flags);
      return copy.test(source);
    });
    if (expected) expect(filter.couldMatch(source, patches)).toBe(true);
  }
});

interface Patch {
  plugin: string;
  find: string | RegExp;
  replacement: {
    match: string | RegExp;
    replace: string | ((...args: any[]) => string);
    fromBuild?: number;
    toBuild?: number;
  }[];
  group?: boolean;
  all?: boolean;
  fromBuild?: number;
  toBuild?: number;
  noWarn?: boolean;
}
interface Harness {
  regexp(source: string, flags: string): RegExp;
  patches: Patch[];
  setFavoriteBridge(bridge: unknown): void;
  patchFactory(
    id: number,
    factory: (...args: any[]) => unknown,
  ): (...args: any[]) => unknown;
}
let original: Harness;
let optimized: Harness;
test("the checked patcher transformation accepts a Windows checkout", async () => {
  const source = await readFile(
    "vendor/equicord/src/webpack/patchWebpack.ts",
    "utf8",
  );
  const unix = source.replace(/\r\n/g, "\n");
  expect(optimizePatcher(unix.replace(/\n/g, "\r\n"), "prefilter")).toBe(
    optimizePatcher(unix, "prefilter"),
  );
});
beforeAll(async () => {
  const source = await readFile(
    "vendor/equicord/src/webpack/patchWebpack.ts",
    "utf8",
  );
  async function harness(optimized: boolean): Promise<Harness> {
    const contents =
      (optimized
        ? optimizePatcher(source, resolve("src/excord/patchPrefilter.ts"))
        : source
      ).replace(/^import .+;$/gm, (line) =>
        line.includes("PatchPrefilter") ? line : "",
      ) +
      "\nexport { patchFactory };export const regexp = (source, flags) => new RegExp(source, flags); export const setFavoriteBridge = bridge => globalThis.favoriteBridge = bridge;\n";
    const result = await build({
      stdin: {
        contents: `
const Settings = {eagerPatches:false}; const reporterData = {};
const traceFunctionWithResults = (_name, fn) => (...args) => [fn(...args),0];
const makeLazy = fn => {let value;return () => value ??= fn();};
class Logger { info(){} warn(){} error(){} debug(){} }
const interpolateIfDefined = () => '';
const wreq = { m: {927815: function(){console.warn("Trying to open a changelog for an invalid build number 300000");} }};
const findModuleFactory = () => function(){console.warn("Trying to open a changelog for an invalid build number 300000");};
${contents}`,
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
    const module = { exports: {} };
    vm.runInNewContext(result.outputFiles[0].text, {
      module,
      exports: module.exports,
      memo: (component: unknown) => component,
    });
    return module.exports as Harness;
  }
  original = await harness(false);
  optimized = await harness(true);
});

test("the optimized patcher preserves ordering, consumption, ranges, and failed groups", () => {
  const cases: Patch[][] = [
    [
      {
        plugin: "first",
        find: "marker",
        replacement: [{ match: "return 1", replace: "return 2" }],
      },
      {
        plugin: "second",
        find: "marker",
        replacement: [{ match: "return 2", replace: "return 3" }],
      },
    ],
    [
      {
        plugin: "group",
        find: "marker",
        group: true,
        replacement: [
          { match: "return 1", replace: "return 2" },
          { match: "absent", replace: "bad" },
        ],
      },
    ],
    [
      {
        plugin: "future",
        find: "marker",
        fromBuild: 900000,
        replacement: [{ match: "return 1", replace: "return 4" }],
      },
    ],
    [
      {
        plugin: "all",
        find: /marker/g,
        all: true,
        replacement: [{ match: "return 1", replace: "return 5" }],
      },
    ],
    [
      { plugin: "past", find: "missing", toBuild: 1, replacement: [] },
      { plugin: "miss", find: /nothing/g, replacement: [] },
    ],
    [
      {
        plugin: "replacement-range",
        find: "marker",
        replacement: [
          { match: "return 1", replace: "return 8", fromBuild: 900000 },
        ],
      },
    ],
    [
      {
        plugin: "invalid",
        find: "marker",
        replacement: [{ match: "return 1", replace: "return !!!" }],
      },
    ],
  ];
  for (const patches of cases) {
    const results = [original, optimized].map((harness) => {
      harness.patches.splice(
        0,
        harness.patches.length,
        ...patches.map((p) => ({
          ...p,
          find:
            typeof p.find === "string"
              ? p.find
              : harness.regexp(p.find.source, p.find.flags),
          replacement: p.replacement.map((r) => ({ ...r })),
        })),
      );
      const first = harness.patchFactory(5, function marker() {
        return 1;
      });
      const second = harness.patchFactory(6, function another() {
        return 1;
      });
      return {
        values: [first(), second()],
        remaining: harness.patches.map((p) => p.plugin),
      };
    });
    expect(results[1]).toEqual(results[0]);
  }
});

test("Favorites captures the real category after tutorial modules through the production patcher", () => {
  const dummy = () => () => null;
  const plugin = createFavoritesPlugin({
    "@webpack/common": {}, "@api/ServerList": {}, "@api/DataStore": {}, "@components/ErrorBoundary": { default: dummy },
    "@webpack": { extractAndLoadChunksLazy: dummy, filters: { byCode: dummy }, findComponentByCodeLazy: dummy, findByCodeLazy: dummy, findByPropsLazy: dummy, mapMangledModuleLazy: dummy, findCssClassesLazy: dummy }
  });
  const patch = plugin.patches[3];
  const canonical = (regex: RegExp) => new RegExp(regex.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));
  for (const harness of [original, optimized]) {
    let captured: unknown;
    harness.patches.splice(0);
    harness.setFavoriteBridge({ captureCategory(component: unknown) { captured = component; return component; } });
    harness.patches.push({ plugin: "ExcordFavorites", find: typeof patch.find === "string" ? patch.find : canonical(patch.find), replacement: [{
      match: canonical(patch.replacement.match),
      replace: (...args: any[]) => patch.replacement.replace(args[0], args[1]).replaceAll("$self", "globalThis.favoriteBridge")
    }] });
    const tutorial = function tutorial() { return { "organize-by-topic": { prerequisites: [] } }; };
    harness.patchFactory(1, tutorial)();
    expect(captured).toBeUndefined();
    const native = vm.runInNewContext(`(${categoryFactory})`, { memo: (component: unknown) => component });
    harness.patchFactory(2, native)();
    expect(typeof captured).toBe("function");
    expect(harness.patches).toHaveLength(0);
    harness.setFavoriteBridge(undefined);
  }
});
