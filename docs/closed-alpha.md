# Excord closed alpha

This is a small Mac and Windows test of Excord 0.0.0-alpha1. It wraps Discord's website and bundles Equicord plus personal TypeScript plugin folders. The Rust/CEF rewrite is on hold.

## Install

The targets are Apple silicon macOS 27 or later and Windows x64. Intel Macs and Windows ARM are outside this alpha. Discord needs an internet connection.

Download the DMG on Mac or the Setup executable on Windows from GitHub Releases. Kits are discontinued. The release also includes updater archives, matching source, and SHA-256 checksums.

Updates appear in Excord Settings. Excord checks quietly one minute after Discord loads and at most once a day automatically. Click Download update to prepare it. Then choose Install when I quit or Restart and update. A normal launch never waits for the updater; a failed check or download leaves the running version alone. Closing to the tray does not install an update. You can still install a downloaded DMG or Setup manually over the existing application.

On Mac, open the DMG, drag the app to Applications, eject the DMG, and launch Excord from Applications. The Mac build is ad-hoc signed to verify bundle integrity, but it has no Developer ID signature or notarization. After verifying the file and its origin, follow Apple's [instructions for opening an app from an unidentified developer](https://support.apple.com/en-us/102445) if macOS blocks the first launch. Do not disable Gatekeeper globally.

On Windows, run `Excord-Setup-0.0.0-alpha1-x64.exe` and install for your user. An unsigned build may show a Windows reputation prompt. Verify that you received this exact build and compare its SHA-256 with `SHA256SUMS`. A computer's application-control policy can block unsigned applications; this alpha does not bypass that policy. The portable ZIP is also available to the maintainer.

Compare the installer hash with SHA256SUMS from the release. On Mac use `shasum -a 256 <installer.dmg>`; on Windows use `Get-FileHash .\Excord-Setup-0.0.0-alpha1-x64.exe -Algorithm SHA256`.

## First session

Open Excord and sign in through Discord's normal login page. Never send anyone a Discord token. Start with the default plugins and complete the accompanying checklist before adding personal plugins.

Excord settings appear inside Discord Settings → Excord Settings. The bundled plugin catalog is under Plugins. Personal plugins live in the folder opened by Excord Settings → Open plugins folder. Edit TypeScript and press Cmd+R or Ctrl+R to compile changed plugins and reload.

The bundled Experiments plugin is enabled by default for new profiles. Saved plugin choices take precedence on upgrades. Enable it under Settings → Plugins → Experiments and refresh if your existing profile has it disabled. Enabling the plugin exposes Discord's experiments controls; it does not turn every experiment on.

Chromium resources are English-only. Discord's own interface language remains selectable, but some browser menus and messages fall back to English.

Save power while hidden is enabled in Excord Settings under System Startup & Performance. Hidden idle windows can pause interface animation. Connecting or active WebRTC connections, pending capture requests, and live camera/screen tracks request full speed. You can turn this setting off without restarting. If a call ends while the window stays hidden, the current Electron runtime defers restoring power saving until you show the window again. This avoids briefly showing or flashing a hidden window.

## Calls and screen sharing

Allow microphone and camera access when you choose to use those devices. Denying permission should leave text chat usable. On Mac, review permissions in System Settings → Privacy & Security if a device remains blocked.

Mac screen sharing uses the native system picker. The app declares its system-audio purpose in its package metadata. This follows Electron's [native-picker API](https://www.electronjs.org/docs/latest/api/desktop-capturer), because custom-picker audio has an [open Electron 43 issue](https://github.com/electron/electron/issues/52738). Actual video, audio capture, permission prompts, and echo behavior still require a live-device test. CI cannot establish that a friend hears your shared audio.

Windows uses Excord's screen/window picker. Test both a full screen and an application window, and ask the other participant to confirm whether they receive sound when Stream With Audio is enabled.

## Recover a broken session

Open the Excord application menu and choose Restart in safe mode. On Windows, press Alt to reveal the menu. The shortcut is Ctrl+Alt+Shift+R on Windows and Cmd+Option+Shift+R on Mac.

Safe mode opens Discord without the Equicord runtime, personal plugins, or themes. It uses a normal window and software rendering, ignores custom launch arguments, and keeps your login and all personal files. The menu changes to Restart with plugins enabled when you want to return. Built-in plugin-dependent desktop enhancements may be unavailable in safe mode.

If Excord cannot reach Discord, it shows a recovery page. Retry from that page after reconnecting, or press Cmd+R or Ctrl+R. The recovery page does not expose the plugin bridge.

If the menu is unavailable, fully quit Excord and launch it with `--safe-mode`. On Mac, use `open -na Excord --args --safe-mode`. From an extracted Windows portable folder, use `.\excord.exe --safe-mode`; for an installed copy, run its `excord.exe` with the same flag.

Reset Excord logs you out and resets settings and QuickCSS. It backs up those files under the profile's backups folder and preserves personal plugin and theme folders. Use safe mode first if you want to keep your session. Excord → Open profile folder lets you inspect or back up that directory. Invalid JSON settings also get an `.invalid-*.bak` copy before defaults are used.

## Report a problem

Use Excord → Export diagnostics or Excord Settings → Compatibility → Export diagnostics. The JSON includes build versions, process metrics, plugin counts, issue counts, and numeric recovery events. It excludes cookies, account identifiers, URLs, filesystem paths, settings contents, plugin source, and raw error messages. There is no automatic upload or telemetry service for these reports.

Send the report and the accompanying feedback form to the person who shared Excord with you. Do not send your profile folder, cookies, credentials, or browser-storage databases. Screenshots should omit private messages.

## What the automated checks establish

The native workflow checks strict TypeScript, plugin compilation and caching, native helpers, RPC, packaged resources, startup, normal shutdown after refreshes, and CSS updates across two windows. The expanded alpha checks install the DMG/NSIS on disposable runners, relaunch, reinstall the same build, and check that a synthetic persistent cookie survives. Recovery checks exercise safe mode with a native plugin present, malformed settings, offline recovery, and the diagnostics privacy boundary.

The Mac CI runner uses macOS 26 while the app declares macOS 27 as its minimum. Gatekeeper, SmartScreen, actual account login, calls, camera output, captured screen/audio, notifications, tray behavior, and sleep/wake must be checked on real computers. A successful catalog build does not establish that every plugin works. The maintainer should complete the checklist on both computers before inviting friends.

## Developer Portal

Enable Discord's Developer Mode under Settings → Advanced. Developer → Developer Portal then appears at the bottom of Settings. Select that entry, then click Open Developer Portal to load Discord's real Developer Portal inside Excord. Use Back to Excord to return to the existing chat session, or Cmd/Ctrl+R to reload the portal. The portal uses the same browser session but receives no Excord bridge or modification preload. Test sign-in and unsaved form prompts before relying on it for application changes.
