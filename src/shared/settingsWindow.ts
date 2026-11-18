/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DesktopBooleanSettings } from "./desktopSettings";
import type { Settings } from "./settings";

export const SettingsChoices = {
  discordBranch: ["stable", "canary", "ptb"],
  webRTCIPHandlingPolicy: [
    "default",
    "default_public_interface_only",
    "default_public_and_private_interfaces",
    "disable_non_proxied_udp",
  ],
} as const;

export function validateDesktopSetting(
  key: unknown,
  value: unknown,
): key is keyof Settings {
  if (typeof key !== "string") return false;
  if (
    Object.values(DesktopBooleanSettings)
      .flat()
      .some((option) => option.key === key)
  )
    return typeof value === "boolean";
  if (key === "discordBranch" || key === "webRTCIPHandlingPolicy")
    return SettingsChoices[key].some((choice) => choice === value);
  return false;
}
