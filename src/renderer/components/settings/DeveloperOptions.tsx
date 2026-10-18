/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, Heading, Paragraph } from "@equicord/types/components";
import { Margins, openModal } from "@equicord/types/utils";
import { Modal } from "@equicord/types/webpack/common";

import { cl, SettingsComponent } from "./Settings";

export const DeveloperOptionsButton: SettingsComponent = () => {
    return <Button onClick={() => openDeveloperOptionsModal()}>Open Developer Settings</Button>;
};

function openDeveloperOptionsModal() {
    openModal(props => (
        <Modal {...props} size="md" title="Excord Developer Options">
            <div style={{ padding: "1em 0" }}>
                <Heading tag="h5">Bundled Equicord runtime</Heading>
                <Paragraph>Excord releases include a tested runtime revision. Use Excord's local plugins folder for personal plugins, then refresh to load changes.</Paragraph>

                <Heading tag="h5" className={Margins.top16}>
                    Debugging
                </Heading>
                <div className={cl("button-grid")}>
                    <Button onClick={() => VesktopNative.debug.launchGpu()}>Open chrome://gpu</Button>
                    <Button onClick={() => VesktopNative.debug.launchWebrtcInternals()}>
                        Open chrome://webrtc-internals
                    </Button>
                </div>
            </div>
        </Modal>
    ));
}
