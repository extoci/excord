# App size measurements

Measured on 2026-10-19. The baseline is the original private v0.1.0 draft from `78056ca1253fd827871f815aa0ad9bba3ae87342`. The smaller build is `a92be78cc166bbb003f4ba650624bf2543da1787`. Both use Electron 43.8.0 and the same pinned Equicord catalog and local TypeScript compiler.

The [baseline native run](https://github.com/extoci/excord/actions/runs/39190065645) and [smaller-build native run](https://github.com/extoci/excord/actions/runs/39207119776) provide the build provenance. Both final platform jobs passed their checks.

## Results

| Target | Measurement | Before, bytes | After, bytes | Reduction |
| --- | --- | ---: | ---: | ---: |
| Mac arm64 | Unpacked ZIP files | 343,736,437 | 280,028,241 | 18.5% |
| Mac arm64 | DMG download | 132,860,493 | 106,887,830 | 19.5% |
| Mac arm64 | ZIP download | 128,486,977 | 113,238,974 | 11.9% |
| Mac arm64 | App ASAR | 20,806,354 | 5,189,471 | 75.1% |
| Windows x64 | Unpacked ZIP files | 411,330,191 | 346,937,858 | 15.7% |
| Windows x64 | Installer download | 119,956,916 | 108,729,395 | 9.4% |
| Windows x64 | ZIP download | 156,028,349 | 141,147,368 | 9.5% |
| Windows x64 | App ASAR | 21,242,658 | 5,195,963 | 75.5% |

Unpacked sizes sum regular-file lengths in each ZIP, excluding directories and symbolic links. They exclude filesystem allocation overhead, user data, and installer-created files. The Windows package check reports 347,045,378 bytes for its build directory because that directory also contains the installer's 107,520-byte elevation helper, which is absent from the portable ZIP. ASAR sizes exclude the unpacked compiler binary, which remains included in the unpacked ZIP total.

## Changes

- Exclude generated source maps and the renderer build report from release packages. Maps remain available with matching bundles in separate private CI artifacts. Local plugins retain inline maps for error reporting.
- Ship only English Chromium language resources, as requested. Mac locale files fell from 48,655,461 to 564,148 bytes; Windows locale files fell from 48,911,733 to 566,095 bytes. Discord's interface languages remain selectable. Some browser menus and messages fall back to English.
- Use maximum compression for Mac artifacts. Keep Windows normal compression after maximum compression exceeded 16 minutes during packaging. Final native packaging took 4 minutes 12 seconds on Mac and 2 minutes 46 seconds on Windows. The baseline took 41 seconds and 3 minutes 25 seconds respectively. These are single CI observations, not controlled build-time benchmarks.
- Reject accidentally bundled maps or unexpected Chromium locales in the package check. Record total file bytes, compiler bytes, locale bytes, largest files, and archive sizes for subsequent releases.

The plugin catalog, shared plugin APIs, local compiler, graphics fallbacks, ICU data, and license notices remain bundled. These changes establish a package-size reduction. They do not establish lower runtime memory, CPU use, or faster startup.

## Verification

Both final native jobs passed strict ts-rust and reference TypeScript checks, all 16 unit tests, RPC verification, package-content checks, actual executable and ASAR shutdown after five refreshes, and local plugin integration checks from source and the packaged ASAR. The integration checks exercise renderer/native helpers, shared APIs, cache hits, compilation-error isolation, recovery, and CSS updates across two windows.

Downloaded ZIP contents were checked against the native reports and tested for archive integrity. Release downloads have matching SHA-256 checksums. Physical-device and logged-in Discord checks remain documented in the [release notes](v0.1.0.md).
