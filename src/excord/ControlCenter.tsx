import "./control-center.css";

import { useEffect, useState } from "@equicord/types/webpack/common";

import type { PerformanceSnapshot } from "./types";

export function ControlCenter() {
    const [diagnostics, setDiagnostics] = useState<PerformanceSnapshot | null>(null);
    const [name, setName] = useState("");
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [tab, setTab] = useState<"plugins" | "performance" | "compatibility">("plugins");

    async function load() {
        setError("");
        try { setDiagnostics(await ExcordNative.diagnostics()); }
        catch { setError("Couldn't read diagnostics. Try again."); }
    }
    useEffect(() => { void load(); }, []);

    async function act(action: () => Promise<unknown>) {
        setBusy(true); setError(""); setMessage("");
        try { await action(); }
        catch (error) { setError(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    }

    const plugins = diagnostics?.localPlugins.plugins ?? [];
    const memory = diagnostics?.processes.reduce((sum, process) => sum + process.memoryMiB, 0);
    return <section className="excord-control" aria-label="Excord control center">
        <header className="excord-header">
            <div className="excord-wordmark"><span className="excord-mark" aria-hidden="true">e</span><h2>Excord</h2><span className="excord-version">{String(VesktopNative.app.getVersion())}</span></div>
            <p>Desktop settings</p>
        </header>
        <nav className="excord-tabs" aria-label="Excord settings">
            {(["plugins", "performance", "compatibility"] as const).map(item => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === "plugins" ? "Local plugins" : item === "performance" ? "Performance" : "About & support"}</button>)}
        </nav>
        {error && <div className="excord-message excord-error" role="alert">{error}</div>}
        {message && <div className="excord-message" role="status">{message}</div>}
        {tab === "plugins" && <>
            <div className="excord-section-heading"><div><h3>Local plugins <span className="excord-count">{diagnostics ? plugins.length : "…"}</span></h3><p>Add your own plugins to Excord.</p></div><button disabled={busy} onClick={() => void act(() => ExcordNative.openPluginsFolder())}>Open folder</button></div>
            {!diagnostics ? error ? <button disabled={busy} onClick={() => void act(load)}>Retry loading plugins</button> : <p role="status">Loading plugins…</p> : plugins.length ? <div className="excord-plugin-list">{plugins.map(plugin => <div className="excord-plugin" key={plugin.folder}><span className="excord-plugin-icon" aria-hidden="true">&#123; &#125;</span><div><h4>{plugin.folder}</h4><p>{plugin.nativePath ? "Plugin with desktop access" : "TypeScript plugin"}</p></div><span className="excord-cache">{plugin.cacheHit ? "Cached" : `${plugin.durationMs.toFixed(0)} ms`}</span></div>)}</div> : <div className="excord-empty"><span className="excord-plugin-icon" aria-hidden="true">&#123; &#125;</span><div><h4>No local plugins yet</h4><p>Drop a plugin into your folder, then refresh Excord.</p></div></div>}
            <div className="excord-plugin-actions">
                <button className="excord-primary" aria-expanded={creating} aria-controls="excord-create-plugin" onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New plugin"}</button>
                <button disabled={busy} onClick={() => void act(() => ExcordNative.refresh())}>Refresh Excord <kbd>{navigator.platform.includes("Mac") ? "⌘R" : "Ctrl+R"}</kbd></button>
            </div>
            {creating && <form id="excord-create-plugin" className="excord-create" onSubmit={event => { event.preventDefault(); void act(async () => { await ExcordNative.createPlugin(name); setMessage(`Created ${name}. Edit index.ts, then refresh Excord to load it.`); setName(""); setCreating(false); }); }}>
                <label htmlFor="excord-plugin-name">Plugin folder name</label>
                <div className="excord-input-row"><input id="excord-plugin-name" placeholder="my-first-plugin" value={name} onChange={event => setName(event.target.value)} pattern="[a-z][a-z0-9-]{0,63}" required maxLength={64} autoComplete="off" /><button className="excord-primary" disabled={busy || !name}>Create plugin</button></div>
                <p>Use lowercase letters, numbers, and hyphens. Start with a letter.</p>
            </form>}
            {(diagnostics?.localPlugins.issues ?? []).map((issue, index) => <div className="excord-message excord-error" key={index}><strong>{issue.folder}</strong><pre>{issue.message}</pre></div>)}
            <p className="excord-note">Manage bundled and local plugins in Settings → Plugins.</p>
            <details className="excord-details"><summary>Writing a plugin</summary><p>Plugins use the Vencord API. Edit index.ts in your plugin folder and refresh Excord to apply changes. Only add code you trust. Plugins can access your Discord session, and native.ts can access your computer.</p></details>
        </>}
        {tab === "performance" && <>
            <div className="excord-section-heading"><div><h3>Performance</h3><p>A snapshot of what Excord is using.</p></div><button disabled={busy} onClick={() => void act(load)}>Refresh metrics</button></div>
            <dl className="excord-metrics">
                <div><dt>Memory</dt><dd>{memory === undefined ? "…" : `${memory.toFixed(0)} MiB`}</dd></div>
                <div><dt>Startup</dt><dd>{diagnostics?.startupMs == null ? "Pending" : `${(diagnostics.startupMs / 1000).toFixed(2)} s`}</dd></div>
                <div><dt>Plugin preparation</dt><dd>{diagnostics ? `${diagnostics.localPlugins.durationMs.toFixed(0)} ms` : "…"}</dd></div>
            </dl>
            <p className="excord-note">Memory includes shared process memory and may count it more than once. Startup measures the first page load, not when your account is ready.</p>
            <details className="excord-details" open><summary>Processes <span className="excord-count">{diagnostics?.processes.length ?? "…"}</span></summary><div className="excord-processes"><table><caption className="excord-sr-only">Current process usage</caption><thead><tr><th scope="col">Process</th><th scope="col">CPU</th><th scope="col">Memory</th></tr></thead><tbody>{diagnostics?.processes.map((process, index) => <tr key={index}><td>{process.type === "Tab" ? "Discord renderer" : process.type}</td><td>{process.cpuPercent.toFixed(1)}%</td><td>{process.memoryMiB.toFixed(1)} MiB</td></tr>)}</tbody></table></div></details>
            <details className="excord-details"><summary>How Excord saves resources</summary><p>Hidden windows reduce interface activity while calls and capture keep full speed. ExcordEfficiency reduces animations and pauses decorative videos while hidden. Configure it in Settings → Plugins.</p><p>Local plugins compile on refresh. Unchanged plugins use their compiled cache. Rich Presence stays off until you enable it.</p></details>
        </>}
        {tab === "compatibility" && <>
            <div className="excord-section-heading"><div><h3>About & support</h3><p>Build information and help with problems.</p></div></div>
            <div className="excord-support-row"><div><h4>Report a problem</h4><p>Save a diagnostics file to share with your bug report.</p></div><button disabled={busy} onClick={() => void act(async () => { if (await ExcordNative.exportDiagnostics()) setMessage("Diagnostics saved. Attach the JSON file to your bug report."); })}>Export diagnostics</button></div>
            <p className="excord-note">The report includes build versions and process usage. It excludes account data, URLs, file paths, plugin source, and raw errors.</p>
            <details className="excord-details"><summary>Excord won't load?</summary><p>Choose Restart in safe mode from the Excord menu. On Windows, press Alt to reveal the menu. Safe mode disables plugins and themes while keeping your login and plugin folders.</p></details>
            <dl className="excord-build-info"><div><dt>Excord</dt><dd>{String(VesktopNative.app.getVersion())}</dd></div><div><dt>Equicord</dt><dd>{diagnostics?.upstream.version ?? "…"}</dd></div><div><dt>Runtime revision</dt><dd><code>{diagnostics?.upstream.commit ?? "…"}</code></dd></div><div><dt>Platforms</dt><dd>macOS 27+ · Apple silicon<br />Windows · x64</dd></div></dl>
            <details className="excord-details"><summary>Plugin compatibility</summary><p>Excord bundles Equicord's plugin catalog and APIs. Runtime updates arrive with Excord releases. Its desktop integration comes from Equibop and Vesktop.</p><p>Local plugins share those APIs. Plugins that need Discord's native desktop modules may not work in Excord. A successful build does not verify every plugin or device feature.</p></details>
        </>}
    </section>;
}
