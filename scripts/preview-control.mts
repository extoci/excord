import { build, type Plugin } from "esbuild";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const revisionIndex = process.argv.indexOf("--revision");
const revision = revisionIndex === -1 ? undefined : process.argv[revisionIndex + 1];
if (revisionIndex !== -1 && !revision) throw new Error("--revision requires a Git revision");
const historicalSource: Plugin = { name: "historical-settings", setup(context) {
    if (!revision) return;
    context.onLoad({ filter: /[/\\]src[/\\]excord[/\\](ControlCenter\.tsx|control-center\.css)$/ }, ({ path }) => ({
        contents: execFileSync("git", ["show", `${revision}:src/excord/${path.split(/[/\\]/).at(-1)}`], { encoding: "utf8" }),
        loader: path.endsWith(".css") ? "css" : "tsx", resolveDir: `${process.cwd()}/src/excord`
    }));
} };
const result = await build({ entryPoints: ["tests/fixtures/control-preview.tsx"], bundle: true, write: false,
    plugins: [historicalSource], format: "iife", outfile: "preview.js", jsx: "automatic", alias: { "@equicord/types/webpack/common": "react" } });
const js = result.outputFiles!.find(file => file.path.endsWith(".js"))!.text;
const css = result.outputFiles!.find(file => file.path.endsWith(".css"))!.text;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Excord settings development preview</title><style>body{margin:0;background:#202024;color:#e7e9ec;font:14px system-ui,sans-serif}main{max-width:892px;margin:0 auto;padding:32px}.preview-note{padding:8px 32px;background:#22282a;color:#a4a9b1;font-size:11px;letter-spacing:.3px}${css}</style><body><div class="preview-note">Local fixture · sample data · network blocked</div><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
const outputIndex = process.argv.indexOf("--output");
if (outputIndex !== -1) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error("--output requires an HTML file path");
    await writeFile(output, html);
    console.log(`Settings fixture written to ${output}`);
} else {
    const server = Bun.serve({ port: 4317, hostname: "0.0.0.0", fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }) });
    console.log(`Excord settings preview: ${server.url}`);
}
