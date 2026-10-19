(() => {
  const capture = (value) => {
    globalThis.__excordInitialPatchPatterns = value.WebpackPatcher.patches.map(
      (patch) => ({
        find:
          typeof patch.find === "string"
            ? patch.find
            : { source: patch.find.source, flags: patch.find.flags },
      }),
    );
  };
  if (globalThis.Vencord) {
    capture(globalThis.Vencord);
    return;
  }
  let runtime;
  Object.defineProperty(globalThis, "Vencord", {
    configurable: true,
    enumerable: true,
    get: () => runtime,
    set: (value) => {
      runtime = value;
      if (!value?.WebpackPatcher) return;
      capture(value);
      Object.defineProperty(globalThis, "Vencord", {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    },
  });
})();
