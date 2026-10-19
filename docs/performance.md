# Excord performance measurements

Performance changes must preserve the bundled catalog and plugin APIs. A smaller installer is not evidence of faster startup or lower runtime CPU. The comparison baseline is Excord source `52d3d08`, the closed-alpha handoff before this optimization work.

## Changes under test

Excord now starts with Chromium's normal background scheduling. An event-driven guard requests full speed for connecting/active WebRTC peers, pending camera/screen permission requests, and live capture tracks, including clones. The existing Discord voice-state signal provides another call guard. Idle capability-probe peers do not count as calls. The setting is **Save power while hidden**, and can be disabled without restarting.

Electron 43.8 does not restore page visibility when throttling is re-enabled on an already hidden window. Excord defers that transition until the window is shown rather than flashing a hidden window. A remotely ended call may therefore keep full-speed scheduling until the next show/hide cycle. The native integration test covers idle animation suspension, real local WebRTC data-channel echo while hidden, protected rendering during that connection, resumption, and setting changes. It does not establish real microphone, camera, or system-audio behavior.

The bundled Equicord patcher uses a conservative prefilter for module factories that cannot match any current patch. Positive candidates still run the upstream replacement loop in its original order. Custom regex matchers and sticky expressions use the upstream path. Global regex state, patch consumption, build ranges, and grouped rollback have regression coverage. The vendor tree remains intact; `scripts/build/optimizePatcher.mts` applies an asserted build-time transformation. An upstream source change fails the build until this transformation is reviewed.

The desktop preload now runs only in the main Discord frame. The native integration test loads a same-origin subframe and verifies it has no desktop or modification bridge.

## Runtime comparison

Build both source revisions with the locked dependencies, then run from the candidate checkout:

```sh
node --import tsx scripts/bench-runtime.mts \
  --baseline /absolute/path/to/baseline --app . \
  --rounds 5 --seconds 5 --output test-results/performance.json \
  --corpus test-results/patch-corpus.json
```

The **Performance comparison** workflow does this on one Apple silicon runner and one Windows x64 runner. Each runner builds both revisions, uses the same Electron executable for both, alternates execution order, and creates a fresh isolated profile for each trial. It records loaded/enabled plugin counts and API-alias counts so disabling the catalog cannot masquerade as an optimization. It waits five seconds after the logged-out login form appears before sampling.

The runtime report separates actual logged-out Discord idle CPU from a synthetic 100-element style-update loop driven by animation frames and a 100 ms timer. That workload tests scheduling, not logged-in scrolling or call quality. The phases are visible, hidden, and visible again. CPU sums Electron's per-process cumulative CPU-time deltas; 100% means one logical CPU core. Working-set totals can double-count shared pages and are not a unique physical-RAM measurement. First-window timings include the automation launch; login timings also include Discord's network and frontend work. These are fresh-profile trials, not OS cold-cache trials.

Playwright normally forces focus/visibility. The benchmark explicitly clears the override on the driver's own CDP session after navigation. Clearing a separate CDP session is insufficient. `scripts/utils/nativeVisibility.mts` checks the pinned driver's interface and fails if it changes. The power integration test verifies actual visibility and suspended/resumed animation before results are accepted. Profiling runs are marked separately and must not be pooled with unprofiled timing samples.

Linux can use `--headless` with a software renderer. Record that environment and do not extrapolate its CPU or memory values to a hardware-accelerated Mac or Windows desktop.

## Patcher comparison

```sh
node --import tsx scripts/bench-patcher.mts \
  test-results/patch-corpus.json test-results/patcher-performance.json
```

The runtime probe captures remaining patch-find patterns, available module text, and the optimized prefilter's cached string index after login. The replay seeds that exact cached index before timing and reports its setup cost separately, and preserves the same first-scan state as the app. The prefilter rebuilds its index when the current ordered string patterns change, including removals; it does not retain obsolete patterns. The patcher benchmark runs the actual pinned `patchFactory` implementation with the original and optimized paths in isolated contexts. It tests factories that match no find pattern, alternates order across 20 trials, and records the corpus hash. It excludes replacement execution, successful matches, and whole-app startup. The raw Discord module corpus stays local and is not included in the verification artifact.

## Competitor comparisons

Official Linux releases selected for the local comparison are Legcord 1.3.1 and Vesktop 1.6.7. The Electron version and effective configuration must accompany results. Skip completed setup forms, wait for Discord's login page, and record whether the run uses the release executable or its official app archive on Excord's Electron host. The latter controls the engine version but does not measure the packaged release. Keep its normal background settings. A defaults comparison is distinct from tuning another client's optional sleep setting. An unmodified wrapper and a bundled Equicord client have different functionality, so their memory/startup figures alone do not establish a like-for-like lead.

The benchmark accepts `--executable`, `--packaged`, and `--client legcord|vesktop`. Legcord additionally takes `--settings` pointing to that release's default config with `doneSetup` set to true. No account or personal profile is used. Hardware calls, screen sharing, battery life, and a logged-in account workload remain separate tests.

## Results

Results and exact verified source revisions are recorded after native runs complete. No startup, memory, battery, or scrolling advantage is claimed solely from a component benchmark or an animation callback count.
