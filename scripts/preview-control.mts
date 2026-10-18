import { build } from "esbuild";

const result = await build({ entryPoints: ["tests/fixtures/control-preview.tsx"], bundle: true, write: false,
    format: "iife", outfile: "preview.js", jsx: "automatic", alias: { "@equicord/types/webpack/common": "react" } });
const js = result.outputFiles!.find(file => file.path.endsWith(".js"))!.text;
const css = result.outputFiles!.find(file => file.path.endsWith(".css"))!.text;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Excord settings development preview</title><style>body{margin:0;background:#17191c;color:#e7e9ec;font:14px system-ui,sans-serif}main{max-width:980px;margin:0 auto;padding:28px 32px}.preview-note{padding:8px 32px;background:#22282a;color:#a4a9b1;font-size:11px;letter-spacing:.3px}${css}</style><body><div class="preview-note">Development preview · sample metrics and plugin folders</div><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
const server = Bun.serve({ port: 4317, hostname: "0.0.0.0", fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }) });
console.log(`Excord settings preview: ${server.url}`);
