/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, HeadingTertiary, Paragraph } from "@equicord/types/components";
import { React } from "@equicord/types/webpack/common";

import { RELEASES_URL } from "../../../excord/updateFeed";
import type { UpdateAction, UpdateSnapshot } from "../../../excord/updates";
import { cl } from "./Settings";

export function Updater() {
    const [state, setState] = React.useState<UpdateSnapshot>();
    const [error, setError] = React.useState<string>();
    React.useEffect(() => {
        let mounted = true;
        const receive = (next: UpdateSnapshot) => {
            if (mounted) setState(previous => previous && previous.revision > next.revision ? previous : next);
        };
        const unsubscribe = ExcordNative.onUpdateState(receive);
        void ExcordNative.getUpdateState().then(receive).catch(() => { if (mounted) setError("Couldn’t read update status. Reopen Settings to retry."); });
        return () => { mounted = false; unsubscribe(); };
    }, []);
    const act = (action: UpdateAction) => {
        setError(undefined);
        void ExcordNative.updateAction(action).catch(() => setError("Couldn’t complete that action. Try again."));
    };
    return <div className={cl("updater-card")}>
        <HeadingTertiary>Updates</HeadingTertiary>
        {state && <Paragraph>Current version: {state.currentVersion}</Paragraph>}
        <div role="status" aria-live="polite">
            {(!state && !error) && "Loading update status…"}
            {state?.phase === "unsupported" && "Updates are available in installed Mac and Windows builds."}
            {state?.phase === "idle" && !state.error && (state.lastCheckedAt ? "No update available." : "Updates haven’t been checked yet.")}
            {state?.phase === "checking" && "Checking for updates…"}
            {state?.phase === "available" && `Update available: ${state.version}`}
            {state?.phase === "downloading" && `Downloading ${state.version}… ${Math.floor(state.progress)}%`}
            {state?.phase === "ready" && (state.installOnQuit ? "The update will install when you quit Excord. It won’t reopen the app." : `Update ${state.version} is ready.`)}
            {state?.phase === "installing" && "Installing update…"}
        </div>
        {(error || state?.error) && <Paragraph>{error || state?.error}</Paragraph>}
        {state?.phase === "downloading" && <progress aria-label="Update download" max={100} value={state.progress} />}
        <div className={cl("update-actions")}>
            {(state?.phase === "idle" || state?.phase === "available") && <Button variant="secondary" onClick={() => act("check")}>{state.error ? "Retry check" : "Check for updates"}</Button>}
            {state?.phase === "available" && <Button onClick={() => act("download")}>Download update</Button>}
            {state?.phase === "downloading" && <Button variant="secondary" onClick={() => act("cancel")}>Cancel</Button>}
            {state?.phase === "ready" && <>
                <Button variant="secondary" onClick={() => act(state.installOnQuit ? "keep-current" : "install-on-quit")}>{state.installOnQuit ? "Cancel install on quit" : "Install when I quit"}</Button>
                <Button onClick={() => act("restart")}>Restart and update</Button>
            </>}
            <a href={RELEASES_URL} target="_blank" rel="noreferrer">Release notes and installers</a>
        </div>
        {state?.notes && <details><summary>Release notes</summary><p className={cl("update-notes")}>{state.notes}</p></details>}
    </div>;
}
