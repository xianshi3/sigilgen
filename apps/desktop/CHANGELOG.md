# Changelog

All notable changes to the Sigilgen desktop client are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **A new application mark.** The orange single-letter tile is replaced by an `SG` hexagon generated
  through the MCP server (`name: "Sigil Gen"`, monogram, hexagon container, seed 1). The exact source
  SVG and call are in `build/icon-source.svg` and `build/icon-source.md`; the browser favicon uses the
  same artwork. This will ship in the next desktop version.

### Fixed

- **Launching with an old part-edit array no longer shows a white window.** The studio now repairs the
  null holes left by the sparse array before rendering; see the root changelog.

## [0.1.0] — 2026-11-05

First release of the desktop client.

### Added

- **A native shell around the studio.** `apps/desktop` builds the same React source as the browser app,
  so there is one interface, one set of tests and no copy to keep in step.
- **Native window chrome.** Windows keeps its caption buttons through `titleBarStyle: hidden` and
  `titleBarOverlay`, preserving Snap Layouts and double-click-to-maximize. macOS keeps its traffic
  lights. Linux keeps its ordinary window frame. The page paints only the 38px drag strip behind them.
- **Window geometry that survives a restart.** Bounds, position and the maximized flag are written on
  close; a window saved on a disconnected monitor is recentred and one smaller than the studio's
  minimum is clamped.
- **Native integration.** A menu localized from the OS locale, a real Save dialog for the edited SVG,
  Electron's clipboard, http(s)-only external links, a single-instance lock and full-screen support
  (F11 or the menu; the strip hides while full screen).
- **A narrow, validated bridge.** `window.sigilgenDesktop` exposes six named members. Main-process
  handlers check the sender, the file name, the SVG size and the contents. The renderer never sees
  `ipcRenderer`, Node or a filesystem path.
- **Packaging for three platforms.** NSIS and portable on Windows, DMG and ZIP on macOS (x64 and
  arm64), AppImage and DEB on Linux, with an icon drawn by Sigilgen itself.

### Fixed

- **The side margins are the same width.** A root-level `scrollbar-gutter` reserved ~10px on the right
  of the window even when nothing scrolled, and the 288/300 panel widths pushed the stage 6px left of
  the window's centre. The gutter now lives on the panel scrollers and both panels are 300px wide.

### Known limitations

- Builds are unsigned. Windows shows SmartScreen; macOS needs the usual unsigned-app confirmation;
  Linux AppImage needs `chmod +x`.
- macOS is built for both x64 and arm64; Windows and Linux are x64 in this release.
- The client has no auto-update channel yet.
