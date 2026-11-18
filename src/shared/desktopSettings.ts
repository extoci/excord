/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "./settings";

export interface BooleanSetting {
  key: keyof Settings;
  title: string;
  description: string;
  disabled?: { key: keyof Settings; value: boolean };
  invisible?: "darwin";
}

export const DesktopBooleanSettings: Record<string, BooleanSetting[]> = {
  "System Startup & Performance": [
    {
      key: "backgroundEfficiency",
      title: "Save power while hidden",
      description:
        "Reduce interface activity while Excord is hidden. Calls, camera, and screen capture keep full speed. Changes apply immediately.",
    },
    {
      key: "hardwareAcceleration",
      title: "Hardware Acceleration",
      description: "Enable hardware acceleration",
    },
    {
      key: "hardwareVideoAcceleration",
      title: "Video Hardware Acceleration",
      description:
        "Enable hardware video acceleration. This can improve performance of screenshare and video playback, but may cause graphical glitches and infinitely loading streams.",
      disabled: { key: "hardwareAcceleration", value: false },
    },
  ],
  "User Interface": [
    {
      key: "nativeTitleBar",
      title: "Native Titlebar",
      description:
        "Enable the system titlebar in addition to Discord's custom one. Requires a full restart.",
    },
    {
      key: "staticTitle",
      title: "Static Title",
      description:
        'Makes the window title "Excord" instead of changing to the current page',
    },
    {
      key: "enableMenu",
      title: "Enable Menu Bar",
      description:
        "Enables the application menu bar. Press ALT to toggle visibility.",
      disabled: { key: "nativeTitleBar", value: false },
    },
    {
      key: "enableShadow",
      title: "Enable Window Shadow",
      description: "Enables the window shadow. Requires a full restart.",
      disabled: { key: "nativeTitleBar", value: true },
    },
    {
      key: "enableRoundedCorners",
      title: "Enable Rounded Corners",
      description: "Enables rounded corners. Requires a full restart.",
      disabled: { key: "nativeTitleBar", value: true },
    },
    {
      key: "enableSplashScreen",
      title: "Enable Splash Screen",
      description:
        "Shows a small splash screen while Excord is loading. Disabling this option will show the main window earlier while it's still loading.",
    },
    {
      key: "splashTheming",
      title: "Splash theming",
      description: "Adapt the splash window colors to your custom theme",
    },
    {
      key: "splashProgress",
      title: "Show progress bar in Splash",
      description: "Adds a fancy progress bar to the splash window",
    },
  ],
  Behaviour: [
    {
      key: "tray",
      title: "Tray Icon",
      description: "Add a tray icon for Excord",
      invisible: "darwin",
    },
    {
      key: "minimizeToTray",
      title: "Minimize to tray",
      description:
        "Hitting X will make Excord minimize to the tray instead of closing",
      invisible: "darwin",
      disabled: { key: "tray", value: false },
    },
    {
      key: "clickTrayToShowHide",
      title: "Hide/Show on tray click",
      description:
        "Left clicking tray icon will toggle the Excord window visibility.",
    },
    {
      key: "disableMinSize",
      title: "Disable minimum window size",
      description:
        "Allows you to make the window as small as your heart desires",
    },
    {
      key: "disableSmoothScroll",
      title: "Disable smooth scrolling",
      description: "Disables smooth scrolling",
    },
  ],
  Notifications: [
    {
      key: "enableTaskbarFlashing",
      title: "Enable Taskbar Flashing",
      description:
        "Flashes the app in your taskbar when you have new notifications.",
    },
  ],
  Miscellaneous: [
    {
      key: "middleClickAutoscroll",
      title: "Middle Click Autoscroll",
      description: "Enables middle-click scrolling (Requires a full restart)",
    },
    {
      key: "openLinksWithElectron",
      title: "Open Links in app (experimental)",
      description:
        "Opens links in a new Excord window instead of your web browser",
    },
  ],
};

export function isSettingDisabled(option: BooleanSetting, settings: Settings) {
  return (
    !!option.disabled && settings[option.disabled.key] === option.disabled.value
  );
}
