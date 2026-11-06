/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { globalExternalsWithRegExp } from "@fal-works/esbuild-plugin-global-externals";

const names: Record<string, string> = {
    webpack: "Vencord.Webpack",
    "webpack/common": "Vencord.Webpack.Common",
    utils: "Vencord.Util",
    api: "Vencord.Api",
    "api/settings": "Vencord",
    components: "Vencord.Components"
};

export default globalExternalsWithRegExp({
    getModuleInfo(modulePath) {
        const path = modulePath.replace("@equicord/types/", "");
        // Subpath imports need the module namespace, not an identically named
        // export from the barrel (e.g. Components.Heading is a function).
        // The bundled runtime exposes these exact namespaces for local plugins.
        if (path.startsWith("components/")) {
            return {
                varName: `ExcordModules[${JSON.stringify("@" + path)}]`,
                type: "cjs"
            };
        }
        let varName = names[path] as string | undefined;
        if (!varName) {
            const altMapping = names[path.split("/")[0]] as string | undefined;
            if (!altMapping) throw new Error("Unknown module path: " + modulePath);

            varName =
                altMapping +
                "." +
                // @ts-ignore
                path.split("/")[1].replaceAll("/", ".");
        }
        return {
            varName,
            type: "cjs"
        };
    },
    modulePathFilter: /^@equicord\/types.+$/
});
