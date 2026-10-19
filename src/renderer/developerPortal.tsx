import { getUserSettingLazy } from "@equicord/types/api/UserSettings";
import { Button } from "@equicord/types/components";
import { createRoot, React } from "@equicord/types/webpack/common";
import type { ComponentType } from "react";

import { DeveloperPortalBanner } from "../excord/DeveloperPortalBanner";
import { appendDeveloperPortalSection, type SettingsLayoutNode } from "../excord/developerPortal";
import { Settings } from "./settings";
import { isMac, isWindows } from "./utils";

const developerMode = getUserSettingLazy<boolean>("appearance", "developerMode");

export function DeveloperPortalIcon({ width = 20, height = 20 }: { width?: number; height?: number; }) {
    return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function DeveloperPortalLaunch() {
    const [error, setError] = React.useState(false);
    const open = () => { void ExcordNative.openDeveloperPortal().catch(() => setError(true)); };
    React.useEffect(open, []);
    return <div className="excord-portal-launch"><h2>Developer Portal</h2>
        <p>{error ? "The portal couldn’t open. Try again." : "Manage your Discord applications and bots inside Excord. Your chat stays open in the background."}</p>
        <Button onClick={open}>Open Developer Portal</Button></div>;
}

interface SettingsPlugin {
    buildLayout(builder: { key?: string; buildLayout(): SettingsLayoutNode[]; }): SettingsLayoutNode[];
    buildEntry(options: { key: string; title: string; Component: ComponentType; Icon: ComponentType<{ width?: number; height?: number; }>; }): SettingsLayoutNode;
}

const plugin = Vencord.Plugins.plugins.Settings as unknown as SettingsPlugin;
const original = plugin.buildLayout;
plugin.buildLayout = function (builder) {
    const layout = original.call(this, builder);
    if (builder.key !== "$Root") return layout;
    let enabled = false;
    try { enabled = developerMode?.getSetting() === true; } catch { /* Hide until Discord's setting is available. */ }
    const sectionType = layout.find(item => item.key === "equicord_section")?.type;
    if (sectionType == null) return layout;
    return appendDeveloperPortalSection(layout, true, enabled, {
        key: "excord_developer_section", type: sectionType, useTitle: () => "Developer",
        buildLayout: () => [plugin.buildEntry({ key: "excord_developer_portal", title: "Developer Portal", Component: DeveloperPortalLaunch, Icon: DeveloperPortalIcon })]
    });
};

let host: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;
ExcordNative.onDeveloperPortalState(state => {
    if (!state.open) {
        root?.unmount(); host?.remove(); root = undefined; host = undefined;
        return;
    }
    if (!host) {
        host = document.createElement("div");
        host.id = "excord-developer-portal-banner";
        document.documentElement.append(host);
        root = createRoot(host);
    }
    root!.render(<DeveloperPortalBanner mac={isMac}
        backButton={<Button variant="secondary" size="small" onClick={() => { void ExcordNative.closeDeveloperPortal(); }}>Back to Excord</Button>}
        windowControls={isWindows && !Settings.store.nativeTitleBar ? {
            minimize: () => { void VesktopNative.win.minimize(); }, maximize: () => { void VesktopNative.win.maximize(); }, close: () => { void VesktopNative.win.close(); }
        } : undefined} />);
});
