/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function applySettingsPatch<T extends object>(
  current: T,
  incoming: T,
  path?: string,
): T {
  if (!path) return incoming;
  const keys = path.split(".");
  if (
    keys.some(
      (key) => !key || ["__proto__", "constructor", "prototype"].includes(key),
    )
  )
    throw new Error("Invalid settings path");
  const result = structuredClone(current);
  let source: Record<string, unknown> = incoming as Record<string, unknown>;
  let target: Record<string, unknown> = result as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    if (
      !source[key] ||
      typeof source[key] !== "object" ||
      Array.isArray(source[key])
    )
      throw new Error("Invalid settings path");
    source = source[key] as Record<string, unknown>;
    target[key] = { ...(target[key] as object) };
    target = target[key] as Record<string, unknown>;
  }
  const key = keys[keys.length - 1];
  if (Object.hasOwn(source, key)) target[key] = source[key];
  else delete target[key];
  return result;
}
