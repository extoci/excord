import assert from "node:assert/strict";
import type { Page } from "playwright-core";

/**
 * Playwright's own CDP session forces focus/visibility. A new CDP session cannot
 * clear another session's override. Touch only the pinned test driver's session;
 * fail closed if a Playwright update changes this internal test-only interface.
 */
export async function useNativeVisibility(page: Page) {
  const connection = (
    page as unknown as { _connection: { toImpl(value: Page): unknown } }
  )._connection;
  const implementation = connection.toImpl(page) as {
    delegate?: {
      _mainFrameSession?: {
        _client?: { send(method: string, params: object): Promise<unknown> };
      };
    };
  };
  const session = implementation.delegate?._mainFrameSession?._client;
  assert.ok(
    session?.send,
    "Review nativeVisibility.mts against the pinned Playwright version before benchmarking",
  );
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });
}
