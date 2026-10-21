// Release builds must share a certificate identity. Ad-hoc signatures cannot
// satisfy the installed app's Squirrel.Mac requirement across different builds.
module.exports = function macReleaseConfig() {
    for (const name of ["CSC_LINK", "CSC_KEY_PASSWORD"]) {
        if (!process.env[name]?.trim()) throw new Error(`Mac releases require ${name}. See docs/releases.md.`);
    }
    if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false")
        throw new Error("Mac releases require CSC_IDENTITY_AUTO_DISCOVERY=true to select the imported certificate.");

    const { build } = require("../../package.json");
    return {
        ...build,
        forceCodeSigning: true,
        mac: {
            ...build.mac,
            // The same self-signed identity is reused for every closed alpha.
            identity: "Excord Updates",
            hardenedRuntime: false,
            notarize: false,
            timestamp: "none"
        }
    };
};
