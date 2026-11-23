// Development CI artifacts are verified in the same run and retained for 14
// days, so they do not need maximum compression. The macOS ZIP alone spent ~6
// minutes at compression: maximum; the Windows ZIP is a convenience artifact
// (latest.yml only requires the NSIS installer), so it is stored uncompressed.
// Release builds (sign_macos) still use package.json settings and
// mac-release.cjs.
module.exports = function devCiConfig() {
    const { build } = require("../../package.json");
    return {
        ...build,
        compression: "normal",
        win: {
            ...build.win,
            compression: "store"
        }
    };
};
