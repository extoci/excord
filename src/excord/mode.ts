/** Safe mode preserves the profile while bypassing all injected modification code. */
export const isSafeMode = process.argv.includes("--safe-mode");
