interface PluginSettings {
    store: { reduceMotion: boolean; pauseDecorativeVideo: boolean };
}

interface SettingsApi {
    definePluginSettings(definition: Record<string, { type: number; description: string; default: boolean; onChange(): void }>): PluginSettings;
}

export function createEfficiencyPlugin(modules: Record<string, unknown>) {
    const { definePluginSettings } = modules["@api/Settings"] as SettingsApi;
    const { OptionType } = modules["@utils/types"] as { OptionType: { BOOLEAN: number } };
    const paused = new Set<HTMLVideoElement>();
    let style: HTMLStyleElement | undefined;
    let running = false;

    function resume() {
        for (const video of paused) {
            if (video.isConnected && video.paused) void video.play().catch(() => {});
        }
        paused.clear();
    }

    function visibilityChanged() {
        if (!running || !settings.store.pauseDecorativeVideo || !document.hidden) { resume(); return; }
        for (const video of document.querySelectorAll("video")) {
            // Never pause voice, incoming streams, camera tracks, or picture-in-picture.
            if (video.loop && video.muted && !video.paused && !video.srcObject && video !== document.pictureInPictureElement) {
                paused.add(video);
                video.pause();
            }
        }
    }

    function update() {
        if (!running) return;
        style?.remove();
        style = undefined;
        if (settings.store.reduceMotion) {
            style = document.createElement("style");
            style.id = "excord-reduced-motion";
            style.textContent = "html.excord-reduced-motion *,html.excord-reduced-motion *::before,html.excord-reduced-motion *::after{transition-duration:0s!important;animation-duration:0.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}";
            document.documentElement.append(style);
        }
        document.documentElement.classList.toggle("excord-reduced-motion", settings.store.reduceMotion);
        visibilityChanged();
    }

    const settings = definePluginSettings({
        reduceMotion: { type: OptionType.BOOLEAN, description: "Remove CSS transitions and shorten CSS animations. Does not change media playback.", default: true, onChange: update },
        pauseDecorativeVideo: { type: OptionType.BOOLEAN, description: "Pause muted looping videos while Excord is hidden, then resume them. Calls, streams, and picture-in-picture continue.", default: true, onChange: update }
    });

    return {
        name: "ExcordEfficiency",
        description: "Reduce interface animation and avoid playing decorative videos while the window is hidden. Each behavior is optional.",
        authors: [{ name: "Excord", id: 0n }],
        enabledByDefault: true,
        startAt: "DOMContentLoaded",
        settings,
        start() {
            running = true;
            document.addEventListener("visibilitychange", visibilityChanged);
            update();
        },
        stop() {
            running = false;
            document.removeEventListener("visibilitychange", visibilityChanged);
            style?.remove();
            document.documentElement.classList.remove("excord-reduced-motion");
            resume();
        }
    };
}
