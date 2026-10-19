(() => {
  const state = { frames: 0, ticks: 0, frame: 0, timer: 0 };
  const node = document.createElement("div");
  node.style.cssText = "position:fixed;top:0;left:0;pointer-events:none";
  const children = Array.from({ length: 100 }, () => {
    const child = document.createElement("i");
    node.append(child);
    return child;
  });
  document.body.append(node);
  const render = () => {
    state.frames++;
    for (let i = 0; i < children.length; i++)
      children[i].style.transform = `translateX(${(state.frames + i) % 200}px)`;
    state.frame = requestAnimationFrame(render);
  };
  state.frame = requestAnimationFrame(render);
  state.timer = setInterval(() => {
    state.ticks++;
  }, 100);
  state.stop = () => {
    cancelAnimationFrame(state.frame);
    clearInterval(state.timer);
    node.remove();
  };
  globalThis.__excordWorkload = state;
})();
