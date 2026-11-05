# Sigilgen Desktop 0.1.0

The first release of the native desktop client. It is the same studio, wrapped in a shell that adds
native window controls, a real Save dialog, a localized menu and a window that remembers where it was.

## Download

| Platform              | Asset                                                                           |
| --------------------- | ------------------------------------------------------------------------------- |
| Windows x64           | `Sigilgen-0.1.0-setup-x64.exe` (installer) or `Sigilgen-0.1.0-portable-x64.exe` |
| macOS (Apple silicon) | `Sigilgen-0.1.0-mac-arm64.dmg`                                                  |
| macOS (Intel)         | `Sigilgen-0.1.0-mac-x64.dmg`                                                    |
| Linux x64             | `Sigilgen-0.1.0-linux-x64.AppImage` or `Sigilgen-0.1.0-linux-x64.deb`           |

`SHA256SUMS.txt` carries the checksums for every asset.

## Highlights

- **Native window chrome.** Windows keeps its caption buttons and Snap Layouts; macOS keeps its traffic
  lights; Linux keeps its ordinary frame. Only the 38px drag strip is drawn by the app.
- **Native Save.** The inspector's Save button opens the system dialog and writes the SVG with the
  current part edits. `Ctrl/Cmd+S` does the same from the menu.
- **Window memory.** Size, position and maximized state survive a restart, with recentring when the
  previous monitor is gone.
- **One interface.** The renderer is the studio source in `apps/web`; a change to the studio is a change
  to the desktop app with no copy to synchronise.
- **A real menu.** File, Edit, View, Window and Help, localized from the OS locale. Undo/redo still
  respect a focused text field.
- **Security-first bridge.** `contextIsolation`, `sandbox`, no `nodeIntegration`, a CSP in production,
  sender-checked IPC, and http(s)-only external links.

## Install notes

These builds are **unsigned**.

- **Windows:** SmartScreen may say "Windows protected your PC". Choose **More info → Run anyway**. The
  portable EXE needs no installation.
- **macOS:** Gatekeeper blocks unsigned apps. Control-click the app → **Open**, or allow it under
  **System Settings → Privacy & Security**.
- **Linux:** `chmod +x Sigilgen-0.1.0-linux-x64.AppImage` then run it. The DEB installs with the
  system package manager.

## Verification

- 507 library tests, 177 studio tests and 22 desktop tests pass.
- The determinism manifest is unchanged (`6f73f3592486`).
- The packaged Windows app was launched and checked by hand: native save round-trip, cancel path,
  F11 full screen, light/dark caption theming, window-state restore, and the 8px/8px side margins.

## Known limitations

- No auto-update channel yet; download a newer release manually.
- macOS is built for x64 and arm64; Windows and Linux are x64 in this release.
- Windows and macOS signing/notarization are not configured.
