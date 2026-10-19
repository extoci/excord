(async () => {
  const first = new RTCPeerConnection({ iceServers: [] });
  const second = new RTCPeerConnection({ iceServers: [] });
  const channel = first.createDataChannel("excord-power-check");
  second.ondatachannel = (event) => {
    event.channel.onmessage = (message) => event.channel.send(message.data);
  };
  const gather = (peer) =>
    new Promise((resolve, reject) => {
      if (peer.iceGatheringState === "complete") return resolve();
      const timeout = setTimeout(
        () => reject(Error("Local ICE gathering timed out")),
        10000,
      );
      peer.addEventListener("icegatheringstatechange", () => {
        if (peer.iceGatheringState === "complete") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  await first.setLocalDescription(await first.createOffer());
  await gather(first);
  await second.setRemoteDescription(first.localDescription);
  await second.setLocalDescription(await second.createAnswer());
  await gather(second);
  await first.setRemoteDescription(second.localDescription);
  await new Promise((resolve, reject) => {
    if (channel.readyState === "open") return resolve();
    const timeout = setTimeout(
      () => reject(Error("Local data channel did not open")),
      10000,
    );
    channel.onopen = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  globalThis.__excordTestPeers = [first, second];
  globalThis.__excordTestChannel = channel;
  return [first.connectionState, second.connectionState];
})();
