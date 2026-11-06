import { expect, test } from "bun:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import vencordDep from "../scripts/build/vencordDep.mts";

test("renderer submodule imports resolve a Heading component, not a property on the legacy Heading function", async () => {
    const result = await build({
        stdin: {
            contents: 'export { Heading } from "@equicord/types/components/Heading";',
            resolveDir: process.cwd()
        },
        bundle: true, write: false, format: "cjs", plugins: [vencordDep]
    });
    function Heading({ children }: React.PropsWithChildren) { return React.createElement("h4", {}, children); }
    // The components barrel exports a legacy Heading function. The submodule
    // exports a namespace containing the current Heading implementation.
    const Vencord = { Components: { Heading: () => null } };
    const ExcordModules = { "@components/Heading": { Heading } };
    const exports = { exports: {} as { Heading: React.ComponentType<React.PropsWithChildren> } };
    new Function("Vencord", "ExcordModules", "module", result.outputFiles[0].text)(Vencord, ExcordModules, exports);
    expect(renderToStaticMarkup(React.createElement(exports.exports.Heading, {}, "Updates"))).toBe("<h4>Updates</h4>");
});

test("Settings recovery instructions name an action that exists in the tray", async () => {
    const settings = await readFile(new URL("../src/renderer/components/settings/Settings.tsx", import.meta.url), "utf8");
    const tray = await readFile(new URL("../src/main/tray.ts", import.meta.url), "utf8");
    const action = settings.match(/then click '([^']+)'/)?.[1];
    expect(action).toBeDefined();
    expect(tray).toContain(`label: "${action}"`);
});
