import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Titlebar } from './components/chrome/Titlebar'
import { DesignPanel } from './components/panels/DesignPanel'
import { InputPanel } from './components/panels/InputPanel'
import { InspectorPanel } from './components/panels/InspectorPanel'
import { OptionPanel } from './components/panels/OptionPanel'
import { ResourcePanel } from './components/panels/ResourcePanel'
import { ConceptStrip } from './components/stage/ConceptStrip'
import { Stage } from './components/stage/Stage'
import { StageBar } from './components/stage/StageBar'
import { useI18n } from './i18n/I18nProvider'
import { useIsNarrow } from './hooks/useMediaQuery'
import { useHotkeys } from './hooks/useHotkeys'
import { useThemeEffect } from './hooks/useThemeEffect'
import { generate } from './lib/generate'
import { PANEL_WIDTH_LEFT, PANEL_WIDTH_RIGHT } from './lib/layout'
import { DURATION_PANEL, EASE_APPLE } from './lib/motion'
import { useStudio } from './store/useStudio'

/** Panel widths, shared by the animation and the inner scroller so the two cannot disagree. */
const LEFT_WIDTH = PANEL_WIDTH_LEFT
const RIGHT_WIDTH = PANEL_WIDTH_RIGHT

export default function App() {
  const { t } = useI18n()

  const studio = useStudio()
  const {
    name,
    keywords,
    brief,
    engine,
    palette,
    font,
    icon,
    size,
    variations,
    background,
    seed,
    preferences,
  } = studio

  // Generated from the individual fields rather than a config object: a fresh object would be a new
  // reference on every render and the memo would never hit.
  const { concepts, errorKey, errorDetail } = useMemo(
    () =>
      generate({
        name,
        keywords,
        brief,
        engine,
        palette,
        font,
        icon,
        size,
        variations,
        background,
        seed,
        preferences,
      }),
    [
      name,
      keywords,
      brief,
      engine,
      palette,
      font,
      icon,
      size,
      variations,
      background,
      seed,
      preferences,
    ]
  )

  const activeConcept = concepts[studio.activeConcept] ?? concepts[0]
  const waiting = name.trim() === ''

  useThemeEffect()
  useHotkeys(concepts.length)

  // Below this width the two panels cannot sit beside the stage — they are fixed width and do not shrink,
  // so between them they consumed the entire viewport and left the canvas nothing. Past that width they
  // become drawers over the stage instead, and only one at a time: two overlays open at once would hide
  // the mark entirely, which is the one thing the app exists to show.
  const narrow = useIsNarrow()
  const { setLeftPanelOpen, setRightPanelOpen, toggleLeftPanel, toggleRightPanel } = studio

  // Which panels were open before the viewport narrowed, so widening the window can put them back.
  //
  // Closing them is not optional — two overlays would hide the mark entirely — but *forgetting* them is
  // its own defect: a reader who briefly shrinks the window loses both panels permanently and has to
  // reload to get them back. Only the transition itself is handled, so deliberately opening a drawer
  // while narrow is not undone by a second run of this effect.
  const restore = useRef<{ left: boolean; right: boolean } | null>(null)
  // `null` rather than the current value, because the first run is not a transition. Seeding this with
  // `narrow` made the effect compare `true` to `true` and return, so a page *loaded* on a phone kept both
  // panels open over the mark — which is the case that matters most.
  const wasNarrow = useRef<boolean | null>(null)

  // The store's panels are open or closed according to the viewport the store was created in, so the
  // first render is already right and nothing has to be corrected after it.
  const leftOpen = studio.leftPanelOpen
  const rightOpen = studio.rightPanelOpen

  // Whether a drawer is covering the stage, which is the only situation a scrim is for. On a wide
  // viewport the panels sit beside the canvas and dimming it would be wrong.
  const drawerOpen = narrow && (leftOpen || rightOpen)

  /** Closes whichever drawer is open. Used by the scrim and by Escape. */
  const closeDrawers = (): void => {
    setLeftPanelOpen(false)
    setRightPanelOpen(false)
  }

  useEffect(() => {
    const before = wasNarrow.current
    wasNarrow.current = narrow

    if (narrow) {
      if (before !== true) {
        // Either the first run — the page was loaded on a phone — or a real transition from a wide
        // window. Both need a restore point; only a re-run while already narrow does not, or it would
        // overwrite the record with the state the layout itself just forced.
        //
        // On the first run the store's own value is not what to restore: it starts closed precisely
        // because the page loaded narrow, so recording it would mean a reader who widened the window
        // once never got their panels back. What they had before the narrowing is the wide default. A
        // real transition records what the reader last chose, which is the more useful answer.
        const { leftPanelOpen, rightPanelOpen } = useStudio.getState()
        restore.current =
          before === null
            ? { left: true, right: true }
            : { left: leftPanelOpen, right: rightPanelOpen }
      }
      setLeftPanelOpen(false)
      setRightPanelOpen(false)
      return
    }

    if (restore.current !== null) {
      setLeftPanelOpen(restore.current.left)
      setRightPanelOpen(restore.current.right)
      restore.current = null
    }
  }, [narrow, setLeftPanelOpen, setRightPanelOpen])

  /** Opens one drawer and closes the other, because there is only room for one. */
  const openLeft = (): void => {
    if (narrow) {
      setRightPanelOpen(false)
    }
    toggleLeftPanel()
  }
  const openRight = (): void => {
    if (narrow) {
      setLeftPanelOpen(false)
    }
    toggleRightPanel()
  }

  // Fewer concepts than the selected index means the selection is now out of range, e.g. after
  // dropping the count from six to one.
  useEffect(() => {
    if (studio.activeConcept >= concepts.length && concepts.length > 0) {
      studio.setActiveConcept(0)
    }
  }, [concepts.length, studio])

  return (
    <div className="flex h-full flex-col bg-[var(--stage)]">
      <Titlebar canReroll={!waiting && errorKey === null} />

      <div className="relative flex min-h-0 flex-1">
        <AnimatePresence initial={false}>
          {leftOpen ? (
            <motion.aside
              key="left"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: LEFT_WIDTH, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: DURATION_PANEL, ease: EASE_APPLE }}
              className={`material z-30 shrink-0 overflow-hidden hairline-r shadow-[var(--shadow-card)]
                ${narrow ? 'absolute inset-y-0 left-0' : ''}`}
            >
              <div className="h-full overflow-y-auto" style={{ width: LEFT_WIDTH }}>
                {/* The panel owns its padding, so the four groups below it share one rhythm instead of
                    each inventing a gutter against its neighbour. */}
                <div className="flex flex-col gap-6 px-gutter py-gutter">
                  <InputPanel />
                  <DesignPanel />
                  <div className="hairline-t -mx-gutter px-gutter pt-6">
                    <ResourcePanel />
                  </div>
                  <div className="hairline-t -mx-gutter px-gutter pt-6">
                    <OptionPanel />
                  </div>
                </div>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <main className="flex min-w-0 flex-1 flex-col">
          <Stage concept={activeConcept} errorKey={errorKey} errorDetail={errorDetail} />
          <StageBar />
          <div className="hairline-t">
            <ConceptStrip concepts={concepts} />
          </div>
        </main>

        <AnimatePresence initial={false}>
          {rightOpen ? (
            <motion.aside
              key="right"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: RIGHT_WIDTH, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: DURATION_PANEL, ease: EASE_APPLE }}
              className={`material z-30 shrink-0 overflow-hidden hairline-l shadow-[var(--shadow-card)]
                ${narrow ? 'absolute inset-y-0 right-0' : ''}`}
            >
              <div className="h-full overflow-y-auto" style={{ width: RIGHT_WIDTH }}>
                <div className="flex flex-col gap-6 px-gutter py-gutter">
                  <InspectorPanel concept={activeConcept} />
                </div>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {/* Scrim for the drawer overlays, and the only way out of one that does not involve finding
            the 16px-wide chevron at the edge of the window.

            A drawer covers the mark outright, and the app exists to show the mark, so the overlay has to
            read as "something is on top" and has to be dismissible by tapping the part of the screen
            that is not covered. A real `<button>` rather than a div, so it is reachable from the keyboard
            and announced, not merely clickable.

            Below the drawer (z-30) so the panel stays readable, and below the toggles (z-40) so the
            chevron that opened it can still be pressed. */}
        <AnimatePresence>
          {drawerOpen ? (
            <motion.button
              key="scrim"
              type="button"
              tabIndex={-1}
              aria-label={t('panel.dismiss')}
              onClick={closeDrawers}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION_PANEL, ease: EASE_APPLE }}
              className="absolute inset-0 z-20 cursor-default bg-[var(--scrim)]"
            />
          ) : null}
        </AnimatePresence>

        {/* Toggles for the panels, in the corners of the stage. They float so the canvas keeps every
            pixel it can, and they stay put when a panel is closed so it can be reopened.

            Above the drawers in the stacking order, which matters only once the panels become overlays: a
            toggle underneath an open drawer would be unreachable, leaving the reader no way to close it. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-40 flex items-center pl-1.5">
          <PanelToggle
            open={studio.leftPanelOpen}
            onClick={openLeft}
            label={studio.leftPanelOpen ? t('panel.collapseLeft') : t('panel.expandLeft')}
            glyph={studio.leftPanelOpen ? '‹' : '›'}
          />
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 z-40 flex items-center pr-1.5">
          <PanelToggle
            open={studio.rightPanelOpen}
            onClick={openRight}
            label={studio.rightPanelOpen ? t('panel.collapseRight') : t('panel.expandRight')}
            glyph={studio.rightPanelOpen ? '›' : '‹'}
          />
        </div>
      </div>
    </div>
  )
}

interface PanelToggleProps {
  open: boolean
  onClick: () => void
  label: string
  glyph: string
}

function PanelToggle({ open, onClick, label, glyph }: PanelToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={open}
      className="material pointer-events-auto flex h-11 w-4 items-center justify-center rounded-control
        text-ink-faint shadow-[var(--shadow-card)] transition-colors duration-fast hover:text-ink"
    >
      <span className="text-caption leading-none">{glyph}</span>
    </button>
  )
}
