import type { ReactNode } from "react";
import "./developerPortal.css";

interface Props {
    backButton: ReactNode;
    mac?: boolean;
    windowControls?: { minimize(): void; maximize(): void; close(): void; };
}

export function DeveloperPortalBanner({ backButton, mac, windowControls }: Props) {
    return <header className={`excord-portal-banner${mac ? " excord-portal-mac" : ""}`} aria-label="Developer Portal navigation">
        {backButton}
        {windowControls && <div className="excord-portal-window-controls">
            <button aria-label="Minimize" onClick={windowControls.minimize}>−</button>
            <button aria-label="Maximize or restore" onClick={windowControls.maximize}>□</button>
            <button aria-label="Close Excord" onClick={windowControls.close}>×</button>
        </div>}
    </header>;
}
