const hosts = new Set(["discord.com", "canary.discord.com", "ptb.discord.com"]);

export function isDiscordOrigin(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && hosts.has(url.hostname) && !url.port && !url.username && !url.password;
    } catch { return false; }
}
