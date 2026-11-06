# Update flow

Excord downloads updates quietly and shows Update ready in Settings; you choose when to restart and install. Turn off Download updates automatically to choose which updates to download.

The switch defaults to on and persists in the existing desktop settings file. Checks wait one minute after the first page load, then run at most once per day. An explicit Check for updates bypasses that interval. Changing the switch takes effect immediately, including during a pending check or download. Turning it on with an available update starts the download without another check.

The update remains ready until the user clicks Restart and update. Download completion does not enable installation on quit, restart the app, navigate Discord, or show a popup. The Settings UI no longer offers Install when I quit. The existing native API retains its explicit opt-in installation path for compatibility.

The system tray also offers Update Excord on both Electron and native Linux menus. This action checks immediately and uses native dialogs to offer a download and confirm Restart and update, without opening Discord or requiring a working renderer. Closing either prompt leaves Excord running. A download already in progress reports its percentage; choose Update Excord again once it finishes. Unsupported builds and manual installation recovery offer the Releases page. Repeated clicks share one flow, and tray actions use the same updater state as Settings.

Checks and downloads use the existing GitHub release feed and electron-updater. Disabling automatic downloads keeps automatic checks and the manual Download action available. Cancel and download errors leave the running version intact and permit manual retry. A rejected macOS signing identity still directs the user to manual installation.

Controller tests cover off/on behavior, check/download cancellation races, no automatic installation, manual downloads, errors, and signature rejection. They use fake drivers and make no Discord requests. Native Mac/Windows update installation remains a separate platform check.
