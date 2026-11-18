/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { classNameFactory } from "@equicord/types/api/Styles";
import { BaseText, Divider, ErrorBoundary } from "@equicord/types/components";
import { ComponentType } from "react";
import { getValueAndOnChange, Settings, useSettings } from "renderer/settings";
import { isMac } from "renderer/utils";
import { BooleanSetting, DesktopBooleanSettings, isSettingDisabled, isSettingVisible } from "shared/desktopSettings";

import { ArRPCSettingsButton } from "./ArRPCSettings";
import { AutoStartToggle } from "./AutoStartToggle";
import { DeveloperOptionsButton } from "./DeveloperOptions";
import { DiscordBranchPicker } from "./DiscordBranchPicker";
import { NotificationBadgeToggle } from "./NotificationBadgeToggle";
import { Updater } from "./Updater";
import { UserAssetsButton } from "./UserAssets";
import { VesktopSettingsSwitch } from "./VesktopSettingsSwitch";
import { WebRTCIPHandlingPolicyPicker } from "./WebRTCIPHandlingPolicyPicker";
import { WindowsTransparencyControls } from "./WindowsTransparencyControls";
import { ControlCenter } from "../../../excord/ControlCenter";

export const cl = classNameFactory("vcd-settings-");

export type SettingsComponent = ComponentType<{ settings: typeof Settings.store }>;

const SettingsOptions: Record<string, Array<BooleanSetting | SettingsComponent>> = {
    "Discord Branch": [DiscordBranchPicker],
    "System Startup & Performance": [AutoStartToggle, ...DesktopBooleanSettings["System Startup & Performance"]],
    "User Interface": [...DesktopBooleanSettings["User Interface"], WindowsTransparencyControls, UserAssetsButton],
    Behaviour: [...DesktopBooleanSettings.Behaviour],
    Notifications: [NotificationBadgeToggle, ...DesktopBooleanSettings.Notifications],
    "Rich Presence": [ArRPCSettingsButton],
    Miscellaneous: [...DesktopBooleanSettings.Miscellaneous, WebRTCIPHandlingPolicyPicker],
    "Developer Options": [DeveloperOptionsButton]
};

function SettingsSections() {
    const Settings = useSettings();

    const sections = Object.entries(SettingsOptions).map(([title, settings], i, arr) => (
        <div key={title} className={cl("category")}>
            <BaseText size="lg" weight="semibold" tag="h3" className={cl("category-title")}>
                {title}
            </BaseText>

            <div className={cl("category-content")}>
                {settings.map((Setting, i) => {
                    if (typeof Setting === "function") return <Setting key={`Custom-${i}`} settings={Settings} />;

                    const { title, description, key } = Setting;
                    if (!isSettingVisible(Setting, isMac ? "darwin" : "other")) return null;

                    return (
                        <VesktopSettingsSwitch
                            title={title}
                            description={description}
                            disabled={isSettingDisabled(Setting, Settings)}
                            {...getValueAndOnChange(key)}
                            key={key}
                        />
                    );
                })}
            </div>

            {i < arr.length - 1 && <Divider className={cl("category-divider")} />}
        </div>
    ));

    return <>{sections}</>;
}

export default ErrorBoundary.wrap(
    function SettingsUI() {
        return (
            <section>
                <ControlCenter />
                <Updater />
                <SettingsSections />
            </section>
        );
    },
    {
        message:
            "Failed to render the Excord Settings tab. Right-click the Excord tray icon, then click 'Verify runtime and restart'. If this issue persists, install the latest Excord release and report the error."
    }
);
