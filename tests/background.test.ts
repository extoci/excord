import { expect, test } from "bun:test";

import { BackgroundPolicy } from "../src/excord/backgroundPolicy";
import { installRealtimeGuard } from "../src/excord/realtime";

test("live calls and captures stay at full speed; idle documents may throttle", () => {
  const applied: boolean[] = [];
  const policy = new BackgroundPolicy((value) => applied.push(value));
  expect(applied).toEqual([true]);
  policy.activity(false);
  expect(applied.at(-1)).toBe(true);
  policy.voiceCall(true);
  policy.activity(false);
  expect(applied.at(-1)).toBe(false);
  policy.activity(true);
  policy.voiceCall(false);
  expect(applied.at(-1)).toBe(false);
  policy.activity(false);
  expect(applied.at(-1)).toBe(true);
  policy.navigation();
  expect(applied.at(-1)).toBe(true);
  policy.configure(false);
  policy.activity(false);
  expect(applied.at(-1)).toBe(false);
  policy.configure(true);
  expect(applied.at(-1)).toBe(true);
  const count = applied.length;
  policy.activity(false);
  expect(applied).toHaveLength(count);
});

class Peer extends EventTarget {
  connectionState = "new";
  close() {
    this.connectionState = "closed";
  }
  state(state: string) {
    this.connectionState = state;
    this.dispatchEvent(new Event("connectionstatechange"));
  }
}
class Track extends EventTarget {
  readyState = "live";
  stop() {
    this.readyState = "ended";
  }
  clone() {
    return new Track();
  }
}
function fixture(mediaDevices: object = {}) {
  const scope = {
    RTCPeerConnection: Peer,
    webkitRTCPeerConnection: Peer,
    navigator: { mediaDevices },
  };
  const reports: boolean[] = [];
  installRealtimeGuard(
    (value) => reports.push(value),
    scope as unknown as typeof globalThis,
  );
  return { scope, reports };
}

test("peer guards preserve construction, handle reconnects, and count simultaneous connections", () => {
  const { scope, reports } = fixture();
  expect(scope.RTCPeerConnection.prototype).toBe(Peer.prototype);
  expect(scope.webkitRTCPeerConnection).toBe(scope.RTCPeerConnection);
  const first = new scope.RTCPeerConnection();
  const second = new scope.RTCPeerConnection();
  expect(first instanceof Peer).toBe(true);
  expect(reports).toEqual([false]);
  first.state("connecting");
  second.state("connected");
  expect(reports).toEqual([false, true]);
  first.close();
  expect(reports.at(-1)).toBe(true);
  second.state("disconnected");
  expect(reports.at(-1)).toBe(true);
  second.state("failed");
  expect(reports.at(-1)).toBe(false);
  second.state("connecting");
  expect(reports.at(-1)).toBe(true);
  second.close();
  expect(reports.at(-1)).toBe(false);
});

test("capture guards preserve constraints and protect cloned tracks until all capture stops", async () => {
  const audio = new Track();
  const video = new Track();
  const constraints = { audio: true, video: true };
  let received: unknown;
  const devices = {
    async getUserMedia(options: unknown) {
      received = options;
      return { getTracks: () => [audio, video] };
    },
  };
  const { reports } = fixture(devices);
  const promise = devices.getUserMedia(constraints);
  expect(reports).toEqual([false, true]);
  await promise;
  expect(received).toBe(constraints);
  const clone = audio.clone();
  audio.stop();
  video.stop();
  expect(reports.at(-1)).toBe(true);
  clone.stop();
  expect(reports.at(-1)).toBe(false);
});

test("denied capture clears the pending guard; external ended events clear active tracks", async () => {
  const denied = new Error("permission denied");
  const track = new Track();
  const devices = {
    async getUserMedia() {
      throw denied;
    },
    async getDisplayMedia() {
      return { getTracks: () => [track] };
    },
  };
  const { reports } = fixture(devices);
  await expect(devices.getUserMedia()).rejects.toBe(denied);
  expect(reports).toEqual([false, true, false]);
  await devices.getDisplayMedia();
  expect(reports.at(-1)).toBe(true);
  track.readyState = "ended";
  track.dispatchEvent(new Event("ended"));
  expect(reports.at(-1)).toBe(false);
});
