import { useEffect, useMemo } from 'react'
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
import { useThemeEffect } from './hooks/useThemeEffect'
import { generate } from './lib/generate'
import { useStudio } from './store/useStudio'

/** Panel widths, shared by the animation and the inner scroller so the two cannot disagree. */
const LEFT_WIDTH = 288
const RIGHT_WIDTH = 300

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
          {studio.leftPanelOpen ? (
            <motion.aside
              key="left"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: LEFT_WIDTH, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="material hairline-r z-10 shrink-0 overflow-hidden"
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
          {studio.rightPanelOpen ? (
            <motion.aside
              key="right"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: RIGHT_WIDTH, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="material hairline-l z-10 shrink-0 overflow-hidden"
            >
              <div className="h-full overflow-y-auto" style={{ width: RIGHT_WIDTH }}>
                <div className="flex flex-col gap-6 px-gutter py-gutter">
                  <InspectorPanel concept={activeConcept} />
                </div>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {/* Toggles for the panels, in the corners of the stage. They float so the canvas keeps every
            pixel it can, and they stay put when a panel is closed so it can be reopened. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 flex items-center pl-1.5">
          <PanelToggle
            open={studio.leftPanelOpen}
            onClick={studio.toggleLeftPanel}
            label={studio.leftPanelOpen ? t('panel.collapseLeft') : t('panel.expandLeft')}
            glyph={studio.leftPanelOpen ? '‹' : '›'}
          />
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center pr-1.5">
          <PanelToggle
            open={studio.rightPanelOpen}
            onClick={studio.toggleRightPanel}
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
