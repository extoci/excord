export const DEVELOPER_PORTAL_URL = "https://discord.com/developers/applications";
export const PORTAL_BANNER_HEIGHT = 40;

/** Only the portal and Discord's sign-in routes belong in this view. */
export function isDeveloperPortalUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.origin === "https://discord.com" && !url.username && !url.password
            && (/^\/developers(?:\/|$)/.test(url.pathname)
                || ["/login", "/register", "/verify", "/reset", "/mfa", "/oauth2/authorize"].includes(url.pathname));
    } catch { return false; }
}

export interface DeveloperPortalState { open: boolean; loading: boolean; failed: boolean; }

export interface SettingsLayoutNode {
    key?: string;
    type: number;
    [key: string]: unknown;
}

/** Preserve Discord's ordering and append our section only to its root layout. */
export function appendDeveloperPortalSection<T extends SettingsLayoutNode>(layout: T[], root: boolean, developerMode: boolean, section: T): T[] {
    if (!root || !developerMode || layout.some(item => item.key === section.key)) return layout;
    return [...layout, section];
}
