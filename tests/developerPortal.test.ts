import { expect, test } from "bun:test";
import { appendDeveloperPortalSection, isDeveloperPortalUrl } from "../src/excord/developerPortal";

test("portal navigation allows Discord's portal/auth routes and rejects unrelated destinations", () => {
    for (const url of ["https://discord.com/developers/applications", "https://discord.com/developers/applications/123/bot", "https://discord.com/login?redirect_to=%2Fdevelopers%2Fapplications", "https://discord.com/oauth2/authorize?client_id=123"])
        expect(isDeveloperPortalUrl(url)).toBe(true);
    for (const url of ["https://discord.com/channels/@me", "https://discord.com/developers-evil", "https://discord.com.evil.test/developers", "https://discord.com@evil.test/developers", "https://user:pass@discord.com/developers", "http://discord.com/developers", "https://discord.com:444/developers", "file:///developers", "javascript:alert(1)"])
        expect(isDeveloperPortalUrl(url)).toBe(false);
});

test("the Developer section is gated, appended at the bottom, and never duplicated", () => {
    const layout = [{ key: "user_section", type: 1 }, { key: "utility_section", type: 1 }];
    const portal = { key: "excord_developer_section", type: 1 };
    expect(appendDeveloperPortalSection(layout, true, false, portal)).toBe(layout);
    expect(appendDeveloperPortalSection(layout, false, true, portal)).toBe(layout);
    const enabled = appendDeveloperPortalSection(layout, true, true, portal);
    expect(enabled.map(item => item.key)).toEqual(["user_section", "utility_section", "excord_developer_section"]);
    expect(layout.length).toBe(2);
    expect(appendDeveloperPortalSection(enabled, true, true, portal)).toBe(enabled);
});
