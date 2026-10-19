# Excord alpha checklist

Build: 0.0.0-alpha1
Tester:
Operating system and version:
CPU architecture:
Date:

Mark each item pass, fail, or not tested. Record failures in alpha-feedback.md. The maintainer should complete this on both Mac and Windows before forwarding the alpha kits.

## First launch and persistence

- [ ] Verify the installer's SHA-256 and install it.
- [ ] Launch from Applications on Mac or the installed shortcut on Windows.
- [ ] Sign in through Discord and open a server/channel.
- [ ] Send a message, upload a file, paste an image, and open an external link.
- [ ] Fully quit, relaunch, and confirm your login and settings remain.
- [ ] Open Excord Settings and confirm the bundled plugin catalog is accessible.

## Developer Portal

- [ ] Enable Developer Mode under Advanced and confirm Developer Portal appears at the bottom of Settings. Disable it and confirm the entry disappears.
- [ ] Open Developer Portal and verify sign-in, resize, zoom, and the Back to Excord button on this device.
- [ ] Return to Excord and confirm the same chat session remains. Reload the portal with Cmd/Ctrl+R.
- [ ] On an unsaved portal form, try returning. Confirm Keep editing stays in the portal and Leave portal returns to Excord.

## Voice and video

- [ ] Join a call with another person and speak/listen for several minutes.
- [ ] Mute, unmute, deafen, and switch the input/output devices you use.
- [ ] Minimize or close the window to the tray and confirm the call continues.
- [ ] Turn the camera on/off and confirm the other person sees video.
- [ ] Share a screen and then a single window. Confirm the other person sees both.
- [ ] Share media audio and confirm the other person hears it without their own voice echoing back. On Mac use the native system picker and its audio controls.
- [ ] Stop and restart sharing. Deny a permission once and confirm the app remains usable; grant it in OS settings and retry.

## Desktop and recovery

- [ ] A notification appears when expected, and clicking it opens the right conversation.
- [ ] Tray/dock open, hide, and quit actions work as expected.
- [ ] Sleep/wake and reconnect; confirm text and a new call work again.
- [ ] Disconnect from the network, refresh, reconnect, and use the recovery page to retry.
- [ ] Create a sample personal plugin, refresh, and confirm it appears in Plugins.
- [ ] Introduce a TypeScript syntax error; confirm Excord reports it and the rest of the client loads. Fix it and refresh again.
- [ ] Restart in safe mode, confirm Discord loads, then restart with plugins enabled. Confirm login and plugin files remain.
- [ ] Export diagnostics. Confirm the file contains the alpha version and attach it to feedback if needed.

## Go/no-go for friends

- [ ] The maintainer has passed installation, login persistence, text chat, a voice call, screen sharing, and safe-mode recovery on Mac.
- [ ] The maintainer has passed those same checks on Windows.
- [ ] Any failed or untested items are disclosed to the invited testers.
- [ ] Each tester can download the installer, guide, matching source, and checksums from Releases.

Do not label unchecked items as verified. Keep the group small while account and hardware behavior is being established.

## Updates

- [ ] Opening Excord does not wait for an update check or open an updater window.
- [ ] Updates appear only in Settings. An offline check fails there without interrupting Discord.
- [ ] Download, cancel, and retry an update. Download completion does not restart the app.
- [ ] Install when I quit can be armed and cancelled. Closing to the tray leaves the app running.
- [ ] On a real update pair, verify installation on full quit without reopening, and explicit restart with reopening. Verify login and plugin folders survive.
