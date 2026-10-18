import "./control-center.css";

import { useEffect, useState } from "@equicord/types/webpack/common";

import type { PerformanceSnapshot } from "./types";

export function ControlCenter() {
    const [diagnostics, setDiagnostics] = useState<PerformanceSnapshot | null>(null);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [tab, setTab] = useState<"plugins" | "performance" | "compatibility">("plugins");

    async function load() {
        try { setDiagnostics(await ExcordNative.diagnostics()); }
        catch (error) { setError(String(error)); }
    }
    useEffect(() => { void load(); }, []);

    async function act(action: () => Promise<unknown>) {
        setBusy(true); setError(""); setMessage("");
        try { await action(); }
        catch (error) { setError(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    }

    const memory = diagnostics?.processes.reduce((sum, process) => sum + process.memoryMiB, 0);
    return <section className="excord-control" aria-label="Excord control center">
        <header className="excord-header">
            <div className="excord-wordmark"><span className="excord-mark" aria-hidden="true">e</span><span>Excord</span><span className="excord-version">v{String(VesktopNative.app.getVersion())}</span></div>
            <p>Desktop settings and personal TypeScript plugins.</p>
        </header>
        <nav className="excord-tabs" aria-label="Excord settings">
            {(["plugins", "performance", "compatibility"] as const).map(item => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === "plugins" ? "Local plugins" : item === "performance" ? "Performance" : "Compatibility"}</button>)}
        </nav>
        {error && <div className="excord-message excord-error" role="alert">{error}</div>}
        {message && <div className="excord-message" role="status">{message}</div>}
        {tab === "plugins" && <>
            <div className="excord-section-heading"><div><h2>Personal TypeScript plugins</h2><p>Edit a plugin folder, then refresh Excord.</p></div><button disabled={busy} onClick={() => void act(() => ExcordNative.openPluginsFolder())}>Open plugins folder</button></div>
            <div className="excord-card excord-create">
                <form onSubmit={event => { event.preventDefault(); void act(async () => { await ExcordNative.createPlugin(name); setMessage(`Created ${name}. Edit index.ts, then refresh to load it.`); setName(""); }); }}>
                    <label htmlFor="excord-plugin-name">Create a personal plugin</label>
                    <div className="excord-input-row"><input id="excord-plugin-name" placeholder="my-first-plugin" value={name} onChange={event => setName(event.target.value)} pattern="[a-z][a-z0-9-]{0,63}" required maxLength={64} autoComplete="off" /><button className="excord-primary" disabled={busy || !name}>Create plugin</button></div>
                    <p>Uses the Vencord plugin API. Local plugins run with your Discord session; native.ts can also use your computer's Node APIs.</p>
                </form>
            </div>
            <div className="excord-section-heading"><h3>Loaded folders <span className="excord-count">{diagnostics?.localPlugins.plugins.length ?? 0}</span></h3><button disabled={busy} onClick={() => void act(() => ExcordNative.refresh())}>Refresh Excord <kbd>{navigator.platform.includes("Mac") ? "⌘R" : "Ctrl+R"}</kbd></button></div>
            {diagnostics?.localPlugins.plugins.length ? <div className="excord-plugin-list">{diagnostics.localPlugins.plugins.map(plugin => <div className="excord-card excord-plugin" key={plugin.folder}><div><h4>{plugin.folder}</h4><p>{plugin.nativePath ? "TypeScript + native module" : "TypeScript plugin"}</p></div><span className="excord-cache">{plugin.cacheHit ? "Cached" : `${plugin.durationMs.toFixed(0)} ms to compile`}</span></div>)}</div> : <div className="excord-empty"><span aria-hidden="true">&#123; &#125;</span><h3>No local plugins loaded</h3><p>Create a plugin above, or copy a plugin folder into the plugins directory.</p></div>}
            {(diagnostics?.localPlugins.issues ?? []).map((issue, index) => <div className="excord-message excord-error" key={index}><strong>{issue.folder}</strong><pre>{issue.message}</pre></div>)}
            <p className="excord-note">The bundled Equicord catalog is in Discord Settings → Plugins. Enable, disable, and configure local plugins there too.</p>
        </>}
        {tab === "performance" && <>
            <div className="excord-section-heading"><div><h2>Performance measurements</h2><p>Process metrics are sampled when you open this page or click Update.</p></div><button onClick={() => void load()}>Update metrics</button></div>
            <div className="excord-metrics">
                <div className="excord-card"><span>Navigation startup</span><strong>{diagnostics?.startupMs == null ? "Pending" : `${(diagnostics.startupMs / 1000).toFixed(2)} s`}</strong><p>Process start to the first page load. This does not measure account readiness.</p></div>
                <div className="excord-card"><span>Process working sets</span><strong>{memory === undefined ? "…" : `${memory.toFixed(0)} MiB`}</strong><p>Sum across Electron processes. Shared memory may appear in more than one process.</p></div>
                <div className="excord-card"><span>Local plugin preparation</span><strong>{diagnostics ? `${diagnostics.localPlugins.durationMs.toFixed(0)} ms` : "…"}</strong><p>Includes the folder scan, compilation, and cache reads.</p></div>
            </div>
            <div className="excord-card"><h3>Excord's defaults</h3><p>No splash window. No plugin runtime download at launch. Rich Presence stays off until you enable it, and uses Electron's Node runtime when enabled. Changed plugins compile on refresh; unchanged folders use their compiled cache.</p><p>ExcordEfficiency reduces CSS animation and pauses muted decorative video while hidden. Configure or disable it in Settings → Plugins.</p></div>
            <div className="excord-processes"><table><thead><tr><th>Process</th><th>CPU</th><th>Working set</th></tr></thead><tbody>{diagnostics?.processes.map((process, index) => <tr key={index}><td>{process.type}</td><td>{process.cpuPercent.toFixed(1)}%</td><td>{process.memoryMiB.toFixed(1)} MiB</td></tr>)}</tbody></table></div>
        </>}
        {tab === "compatibility" && <>
            <h2>What Excord keeps</h2><p>Excord v0 retains Equicord's plugin manager, Webpack patcher, settings APIs, and bundled plugins. The desktop integration comes from Equibop and Vesktop. These are deliberate compatibility costs, not a completed core rewrite.</p>
            <div className="excord-card"><h3>Bundled revision</h3><p>Equicord {diagnostics?.upstream.version}</p><code>{diagnostics?.upstream.commit}</code><p>The runtime updates with Excord releases. Excord does not host a separate plugin catalog.</p></div>
            <div className="excord-card"><h3>Local plugin compatibility</h3><p>Local plugins share the bundled runtime's API modules and initialize before Discord loads. Patches, settings, dependencies, JSX, managed CSS, and native.ts use the upstream lifecycle. Unknown imports produce compilation errors.</p><p>Plugins that rely on Discord's native desktop modules may need those modules to exist in a web wrapper. A successful build does not verify every plugin against a live Discord account.</p></div>
            <div className="excord-card"><h3>Platform verification</h3><p>Primary release targets are Apple silicon macOS 27+ and Windows x64. Voice, screen sharing, device permissions, and installation must also pass on those operating systems.</p></div>
        </>}
    </section>;
}
