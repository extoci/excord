import { build } from "esbuild";

// A synthetic message mounts the actual plugin. No Discord account is used.
const bundle = await build({ entryPoints: ["tests/fixtures/html-visualizations-preview.tsx"], bundle: true, write: false, format: "iife", jsx: "transform" });
const server = Bun.serve({ hostname: "0.0.0.0", port: 0, fetch(request) {
    if (new URL(request.url).pathname === "/preview.js") return new Response(bundle.outputFiles[0].text, { headers: { "Content-Type": "text/javascript" } });
    return new Response(`<!doctype html><html class="theme-dark"><head><title>HTML visualization plugin verification</title><style>:root{--background-primary:#313338;--text-normal:#dbdee1;--text-link:#8bafff}body{margin:0;padding:32px;background:var(--background-primary);color:var(--text-normal);font:16px system-ui}#root{max-width:728px}</style></head><body><p>Synthetic Discord message. Uses the actual HtmlVisualizations plugin with test settings.</p><main id="root"></main><script src="/preview.js"></script></body></html>`, { headers: { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; frame-src 'self'; img-src https: data: blob:; connect-src 'self' https://cdn.discordapp.com https://media.discordapp.net" } });
} });
console.log(`HTML plugin verification: http://localhost:${server.port}`);
