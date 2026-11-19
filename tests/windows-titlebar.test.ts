import { expect, test } from "bun:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

const bundle = await build({
    entryPoints: ["src/renderer/patches/windowsTitleBar.tsx"], bundle: true, write: false,
    platform: "node", format: "cjs", external: ["renderer/settings", "renderer/utils", "./shared"]
});
type Replacement = { match: RegExp; replace: string; };
type Patch = { find: string; replacement: Replacement[]; };
function patches(isMac = false, nativeTitleBar = false) {
    const registered: Patch[] = [];
    runInNewContext(bundle.outputFiles[0].text, { require(name: string) {
        if (name === "renderer/settings") return { Settings: { store: { nativeTitleBar } } };
        if (name === "renderer/utils") return { isMac };
        if (name === "./shared") return { addPatch: ({ patches }: { patches: Patch[]; }) => registered.push(...patches) };
        throw Error(`Unexpected import: ${name}`);
    } });
    return registered;
}
function apply(source: string) {
    for (const patch of patches()) {
        if (!source.includes(patch.find)) continue;
        for (const { match, replace } of patch.replacement) {
            const canonical = new RegExp(match.source.replaceAll("\\i", "(?:[A-Za-z_$][\\w$]*)"), match.flags);
            source = source.replace(canonical, replace);
        }
    }
    return source;
}

for (const enumName of ["fg", "PlatformTypes"]) {
    test(`Windows titlebar accepts Discord's ${enumName} export`, () => {
        const source = `function titlebar(c,E){let A=c===E.${enumName}.WINDOWS;if(c===E.${enumName}.WEB)return null;return A}function size(){return "refresh-title-bar-small"}`;
        const patched = apply(source);
        expect(patched).toContain("let A=true;if(false)return null");
        expect(new Function(`${patched};return titlebar('WEB',{});`)()).toBe(true);
    });
}
test("unrelated and empty modules are unchanged", () => {
    expect(apply("")).toBe("");
    const source = '"refresh-title-bar-small";c===E.fg.OSX;c!==E.fg.WEB';
    expect(apply(source)).toBe(source);
    expect(apply("c===E.fg.WINDOWS")).toBe("c===E.fg.WINDOWS");
});
test("native titlebars and macOS do not register Windows titlebar patches", () => {
    expect(patches(true)).toEqual([]);
    expect(patches(false, true)).toEqual([]);
});
