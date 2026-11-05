# ADR-003: Electron for the desktop shell, with the studio as its renderer

- **Status:** accepted
- **Date:** 2026-11-05

## Context

Sigilgen already has a browser client, `apps/web`, built with React 19, Vite 8 and Tailwind 4. The
desktop client needs three things the browser cannot provide: native window controls that behave the
way the operating system expects, a native Save dialog, and a window that remembers where it was. It
must run on Windows, macOS and Linux.

The renderer is not a small component to duplicate. It is the whole studio: panels, stage, inspector,
persistence, localization and 171 tests. A second implementation would be a second product.

## Decision

**Use Electron 45 with electron-vite 6, and make `apps/web` itself the renderer.**

- `electron.vite.config.ts` sets the renderer root to `apps/web` and its input to
  `apps/web/index.html`. There is no copied UI and no second entry point.
- The window is **not frameless**. Windows and macOS keep their native caption controls via
  `titleBarStyle: 'hidden'` + `titleBarOverlay` and `hiddenInset`; Linux keeps its ordinary frame.
  The page paints a 38 px drag strip behind the controls.
- The preload exposes a named bridge (`window.sigilgenDesktop`), never `ipcRenderer`. Main-process
  handlers validate every value that crosses IPC.
- Native behaviour is preferred over a uniform custom one: Snap Layouts, double-click-to-maximize,
  the system menu and screen-reader names all come from the OS because the OS still owns the buttons.

## Consequences

- One interface, two hosts. A studio change is a desktop change with no copy to keep in step; the
  reverse is not true, because the desktop-only `WindowChrome` returns `null` in a browser.
- The build stays reproducible with Node alone. There is no Rust or C++ toolchain in the setup.
- Rendering is the same Chromium on every platform, which matters for a design tool that uses
  `oklch()`, `color-mix()` and measured layout.
- The installers are about 110–120 MB, and an idle window uses more memory than a native webview
  would. For a local design tool this is an acceptable trade.
- Native save, clipboard and window-state behaviour are testable at the boundary (pure geometry and
  validation modules) and by launching the packaged app; the UI itself remains covered by the studio
  suite in jsdom.
- Windows and macOS builds are unsigned until a release pipeline supplies certificates.

## Alternatives considered

| Option                                 | Why not                                                                                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri 2                                | Smaller binaries, but it needs Rust plus Microsoft's C++ build tools on Windows, and macOS renders in WebKit rather than Chromium. The studio is a Vite/React app whose look was tuned in Chromium. |
| Electron with a fully custom title bar | Loses Snap Layouts and native caption behaviour; every control has to reimplement hover, focus, accessibility and DPI handling.                                                                     |
| Wails                                  | Small and Go-native, but its window-chrome and packaging ecosystem is thinner, and the desktop UI would still be a webview with the same size trade-off as Tauri.                                   |
| A PWA                                  | Cannot provide a native Save dialog, a real application menu, or window geometry across launches.                                                                                                   |
| Duplicate the studio as a native UI    | Two implementations of one design tool, and the 171 studio tests would cover only one of them.                                                                                                      |
