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
  --rounds 5 --seconds 5 --output test-results/performance.json
```

The **Performance comparison** workflow does this on one Apple silicon runner and one Windows x64 runner. Each runner builds both revisions, uses the same Electron executable for both, alternates execution order, and creates a fresh isolated profile for each trial. It records loaded/enabled plugin counts and API-alias counts so disabling the catalog cannot masquerade as an optimization. It waits 30 seconds after the logged-out login form appears before sampling. The initial five-second settling runs are retained separately because Windows was sometimes still busy loading Discord. `--settle` records and controls this interval.

The runtime report separates actual logged-out Discord idle CPU from a synthetic 100-element style-update loop driven by animation frames and a 100 ms timer. That workload tests scheduling, not logged-in scrolling or call quality. The phases are visible, hidden, and visible again. CPU sums Electron's per-process cumulative CPU-time deltas; 100% means one logical CPU core. Working-set totals can double-count shared pages and are not a unique physical-RAM measurement. First-window timings include the automation launch; login timings also include Discord's network and frontend work. These are fresh-profile trials, not OS cold-cache trials.

Playwright normally forces focus/visibility. The benchmark explicitly clears the override on the driver's own CDP session after navigation. Clearing a separate CDP session is insufficient. `scripts/utils/nativeVisibility.mts` checks the pinned driver's interface and fails if it changes. The power integration test verifies actual visibility and suspended/resumed animation before results are accepted. Profiling runs are marked separately and must not be pooled with unprofiled timing samples.

Linux can use `--headless` with a software renderer. Record that environment and do not extrapolate its CPU or memory values to a hardware-accelerated Mac or Windows desktop.

## Patcher comparison

Capture the corpus in a separate launch so module serialization does not affect runtime samples.

```sh
node --import tsx scripts/bench-runtime.mts \
  --app . --rounds 1 --seconds 1 --output test-results/corpus-run.json \
  --corpus test-results/patch-corpus.json
node --import tsx scripts/bench-patcher.mts \
  test-results/patch-corpus.json test-results/patcher-performance.json
```

The runtime probe captures remaining patch-find patterns, available module text, and the optimized prefilter's cached string index after login. The replay seeds that exact cached index before timing and reports its setup cost separately, and preserves the same first-scan state as the app. The prefilter rebuilds its index when the current ordered string patterns change, including removals; it does not retain obsolete patterns. The patcher benchmark runs the actual pinned `patchFactory` implementation with the original and optimized paths in isolated contexts. It tests factories that match no find pattern, alternates order across 20 trials, reports the upper median, and records the corpus hash. It excludes replacement execution, successful matches, and whole-app startup. The raw Discord module corpus stays local and is not included in the verification artifact.

## Competitor comparisons

Official Linux releases selected for the local comparison are Legcord 1.3.1 and Vesktop 1.6.7. The Electron version and effective configuration must accompany results. Skip completed setup forms, wait for Discord's login page, and record whether the run uses the release executable or its official app archive on Excord's Electron host. The latter controls the engine version but does not measure the packaged release. Keep its normal background settings. A defaults comparison is distinct from tuning another client's optional sleep setting. An unmodified wrapper and a bundled Equicord client have different functionality, so their memory/startup figures alone do not establish a like-for-like lead.

The benchmark accepts `--executable`, `--packaged`, and `--client legcord|vesktop`. Legcord additionally takes `--settings` pointing to that release's default config with `doneSetup` set to true. No account or personal profile is used. Hardware calls, screen sharing, battery life, and a logged-in account workload remain separate tests.

## Results, 2026-10-19

The [30-second settling run](https://github.com/extoci/excord/actions/runs/39257307030) passed on both platforms. It compares baseline `52d3d08c845eadd5b828340b57e7bfaafeb44ee5` with measurement revision `67b6b7e36bba3fbbdd68d0534774454c2031a151`. The alpha installers use `f3e4523600a1e9a3b768af4b6569bdeb77f6c705`; the only change between those candidate revisions is the benchmark settling option. Application source is identical. Both use Electron 43.8.0 and Chromium 150.0.7871.250.

Runtime rows report medians of five trials per variant. Patcher rows report the upper median of 20 alternating replays. Every launch loaded 380 plugin definitions, 1,422 API aliases, and 20 enabled plugins.

| Platform | Measurement | Before | Alpha.2 | Observed change |
| --- | --- | ---: | ---: | ---: |
| Mac arm64 | Hidden workload CPU | 11.19 % | 0.14 % | -98.7% |
| Mac arm64 | Patch-miss replay | 151.08 ms | 61.78 ms | -59.1% |
| Mac arm64 | First window | 668.14 ms | 712.02 ms | +6.6% |
| Mac arm64 | Working-set sum | 945.95 MiB | 956.94 MiB | +1.2% |
| Windows x64 | Hidden workload CPU | 7.89 % | 0.21 % | -97.3% |
| Windows x64 | Patch-miss replay | 251.08 ms | 110.40 ms | -56.0% |
| Windows x64 | First window | 1787.67 ms | 1181.79 ms | -33.9% |
| Windows x64 | Working-set sum | 721.46 MiB | 724.75 MiB | +0.5% |

Hidden workload CPU is the animation fixture, not the actual idle row. All ten candidate trials paused animation completely while hidden and resumed when shown. The actual logged-out visible-idle samples are retained in the raw reports. Hardware and ranges matter:

- Mac arm64, Apple M2 Pro (Virtual): hidden CPU ranged from 8.87% to 12.75% before, and 0.13% to 0.25% after. Baseline median animation callbacks were 209 per five seconds; every candidate trial recorded zero.
- Windows x64, AMD EPYC 9V74 80-Core Processor: hidden CPU ranged from 4.78% to 16.44% before, and 0.08% to 0.57% after. Baseline median animation callbacks were 321 per five seconds; every candidate trial recorded zero.

The patcher replay covers 11,282 negative matches among 11,312 captured factories, with 18 remaining string patterns. It measures the actual pinned patcher on captured factory text. It is not a whole-startup speedup.

There is no established overall startup or RAM advantage. Mac first-window timing was about 44 ms slower in this cohort and also slower in the initial cohort. Windows first-window improvement varied from about 1% in the initial cohort to 34% in this repeat, so it is not a dependable product claim. Working-set sums were slightly higher in the repeat and do not measure unique physical RAM.

The [initial five-second settling run](https://github.com/extoci/excord/actions/runs/39255718681) is retained under `initial-5s/`, including its noisy Windows samples. One baseline visible-idle trial reached 84% of one core, and candidate median working-set size was about 100 MiB higher. The repeat used a longer settling interval and a different Windows CI host, so it does not prove which factor caused the difference. No samples were removed from either report.

The official Legcord 1.3.1 and Vesktop 1.6.7 launch attempts did not complete the same probe. They are excluded. These figures establish improvements over the previous Excord build, not a quantified ranking against other clients.

The [native installer run](https://github.com/extoci/excord/actions/runs/39255717621) passed both targets, including strict/reference type checks, 29 unit tests, installation and reinstallation, plugin refresh, recovery, normal shutdown, hidden local WebRTC echo, and subframe isolation. Physical-device voice/video and screen-audio checks remain open.

Raw reports and a standalone interactive comparison:

- [Mac runtime](performance-results/2026-10-19/mac/runtime.json) and [patcher](performance-results/2026-10-19/mac/patcher.json).
- [Windows runtime](performance-results/2026-10-19/win/runtime.json) and [patcher](performance-results/2026-10-19/win/patcher.json).
- [Initial Mac runtime](performance-results/2026-10-19/initial-5s/mac/runtime.json) and [Windows runtime](performance-results/2026-10-19/initial-5s/win/runtime.json).
- [Standalone comparison](performance-results/2026-10-19/index.html) and [summary data](performance-results/2026-10-19/summary.json).
