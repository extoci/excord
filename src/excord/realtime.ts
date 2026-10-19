/** Event driven; no polling, Discord internals, or changes to media constraints. */
export function installRealtimeGuard(
  report: (active: boolean) => void,
  scope: typeof globalThis = globalThis,
) {
  const peers = new Set<RTCPeerConnection>();
  const tracks = new Set<MediaStreamTrack>();
  let pending = 0;
  let last: boolean | undefined;
  const update = () => {
    const active = pending > 0 || peers.size > 0 || tracks.size > 0;
    if (active !== last) {
      last = active;
      report(active);
    }
  };
  const originalPeer = scope.RTCPeerConnection;
  if (originalPeer) {
    scope.RTCPeerConnection = new Proxy(originalPeer, {
      construct(target, args, newTarget) {
        const peer = Reflect.construct(
          target,
          args,
          newTarget,
        ) as RTCPeerConnection;
        const changed = () => {
          if (
            peer.connectionState === "new" ||
            peer.connectionState === "closed" ||
            peer.connectionState === "failed"
          )
            peers.delete(peer);
          else peers.add(peer);
          update();
        };
        peer.addEventListener("connectionstatechange", changed);
        const close = peer.close;
        peer.close = function () {
          try {
            return close.call(this);
          } finally {
            changed();
          }
        };
        changed();
        return peer;
      },
    });
    const legacy = scope as typeof globalThis & {
      webkitRTCPeerConnection?: typeof RTCPeerConnection;
    };
    if (legacy.webkitRTCPeerConnection === originalPeer)
      legacy.webkitRTCPeerConnection = scope.RTCPeerConnection;
  }
  function watchTrack(track: MediaStreamTrack) {
    if (track.readyState === "ended" || tracks.has(track)) return;
    tracks.add(track);
    const ended = () => {
      tracks.delete(track);
      update();
    };
    track.addEventListener("ended", ended, { once: true });
    const stop = track.stop;
    track.stop = function () {
      try {
        return stop.call(this);
      } finally {
        tracks.delete(this);
        update();
      }
    };
    const clone = track.clone;
    track.clone = function () {
      const copy = clone.call(this);
      watchTrack(copy);
      update();
      return copy;
    };
  }
  const devices = scope.navigator?.mediaDevices;
  for (const name of ["getUserMedia", "getDisplayMedia"] as const) {
    if (!devices?.[name]) continue;
    const capture = devices[name];
    devices[name] = async function (options) {
      pending++;
      update();
      try {
        const stream = await capture.call(this, options);
        for (const track of stream.getTracks()) watchTrack(track);
        return stream;
      } finally {
        pending--;
        update();
      }
    };
  }
  update();
}
