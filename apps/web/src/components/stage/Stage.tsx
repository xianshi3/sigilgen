import { useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import type { LogoResult } from '@sigilgen/types'
import type { MessageKey } from '../../i18n/locales/zh'
import { useI18n } from '../../i18n/I18nProvider'
import { emptyEdit, parseSvgParts, partTransform } from '../../lib/svgParts'
import { DURATION_BASE, EASE_APPLE } from '../../lib/motion'
import { useStudio, type Backdrop } from '../../store/useStudio'

export interface StageProps {
  concept: LogoResult | undefined
  /** Set when generation failed; the stage explains it instead of showing a mark. */
  errorKey: MessageKey | null
  errorDetail: string | null
}

/** Backdrop fills. Fixed paper colours, not themed tokens — see `--paper-light` in the token sheet. */
const BACKDROP_STYLE: Record<Backdrop, string> = {
  light: 'bg-[var(--paper-light)]',
  dark: 'bg-[var(--paper-dark)]',
  board: 'bg-[var(--paper-checker-b)]',
}

/**
 * The canvas.
 *
 * The mark sits on a *sheet* — a square of paper, inset, rounded and lifted — rather than filling the
 * stage edge to edge. An edge-to-edge fill puts the artwork in the middle of a large undifferentiated
 * rectangle, and the eye reads that as an unfinished canvas rather than a presentation. A sheet with an
 * edge, a corner and a shadow has a boundary, which is what makes the artwork the subject of the screen
 * instead of the middle of it.
 *
 * The sheet is the surface the palette's colours were chosen against, so it keeps its fixed paper colours
 * in both themes — see `--paper-light` in the token sheet.
 *
 * ## The mark is inline SVG, not an image
 *
 * It used to be a data URL in an `<img>`, which is the right way to show a finished document and the wrong
 * way to edit one: an image has no parts. Rendering the paths inline is what makes each shape selectable
 * and draggable, and it costs nothing — the document is a handful of paths either way.
 *
 * The generator forbids script and event handlers in its output, so putting that markup in the DOM is
 * safe by construction rather than by sanitising it on the way in.
 */
export function Stage({ concept, errorKey, errorDetail }: StageProps) {
  const { t } = useI18n()
  const backdrop = useStudio(state => state.backdrop)
  const zoom = useStudio(state => state.zoom)
  const editMode = useStudio(state => state.editMode)
  const selectedPart = useStudio(state => state.selectedPart)
  const selectPart = useStudio(state => state.selectPart)
  const beginEdit = useStudio(state => state.beginEdit)
  const updatePart = useStudio(state => state.updatePart)

  const svgRef = useRef<SVGSVGElement>(null)
  // Where the current drag started, in user units, plus the part's transform at that moment. Stored in a
  // ref rather than state because a drag fires dozens of moves a second and none of them need a render.
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)

  const parts = useMemo(
    () => (concept === undefined ? null : parseSvgParts(concept.svg)),
    [concept]
  )
  const edits = useStudio(state => (concept === undefined ? undefined : state.edits[concept.seed]))

  /** Converts a pointer position to the SVG's own user units, so a drag means the same thing at any zoom. */
  const toUserUnits = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current
    if (svg === null || parts === null) {
      return { x: 0, y: 0 }
    }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * parts.viewBox[2],
      y: ((clientY - rect.top) / rect.height) * parts.viewBox[3],
    }
  }

  const onPointerDown =
    (index: number) =>
    (event: React.PointerEvent): void => {
      if (!editMode || concept === undefined || parts === null) {
        return
      }
      event.stopPropagation()
      selectPart(index)
      // One snapshot for the whole drag, so undo restores the position the part was in before it moved
      // rather than one pixel into the move.
      beginEdit()
      const point = toUserUnits(event.clientX, event.clientY)
      const edit = edits?.[index] ?? emptyEdit()
      drag.current = { x: point.x, y: point.y, dx: edit.dx, dy: edit.dy }
      svgRef.current?.setPointerCapture(event.pointerId)
    }

  const onPointerMove = (event: React.PointerEvent): void => {
    const active = drag.current
    if (active === null || concept === undefined || selectedPart === null) {
      return
    }
    const point = toUserUnits(event.clientX, event.clientY)
    updatePart(concept.seed, selectedPart, {
      dx: Math.round((active.dx + point.x - active.x) * 100) / 100,
      dy: Math.round((active.dy + point.y - active.y) * 100) / 100,
    })
  }

  const endDrag = (): void => {
    drag.current = null
  }

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--stage)] p-5 sm:p-8">
      <div
        className={`relative flex aspect-square max-h-full w-full max-w-full items-center justify-center
          overflow-hidden rounded-panel ${BACKDROP_STYLE[backdrop]} shadow-[var(--shadow-lift)]`}
        style={
          backdrop === 'board'
            ? {
                backgroundImage: `linear-gradient(45deg, var(--paper-checker-a) 25%, transparent 25%),
                  linear-gradient(-45deg, var(--paper-checker-a) 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, var(--paper-checker-a) 75%),
                  linear-gradient(-45deg, transparent 75%, var(--paper-checker-a) 75%)`,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
              }
            : undefined
        }
      >
        {concept === undefined ? (
          <div className="flex max-w-[min(22rem,80%)] flex-col items-center gap-2 text-center">
            <p className={`type-title ${errorKey === null ? 'text-ink-soft' : 'text-ink'}`}>
              {errorKey === null ? t('empty.title') : t('error.title')}
            </p>
            <p className="type-body text-ink-faint">
              {errorKey === null ? t('empty.body') : t(errorKey)}
            </p>
            <p className="type-caption text-ink-faint/70">
              {errorKey === null ? t('empty.suggestion') : errorDetail}
            </p>
          </div>
        ) : parts === null ? null : (
          <motion.div
            // Keyed by the concept's own seed fingerprint, so switching concepts cross-fades while
            // retyping the name swaps the image without a flash.
            key={concept.seed}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
            className="h-full w-full"
          >
            <svg
              ref={svgRef}
              viewBox={parts.viewBox.join(' ')}
              className={zoom === 'fit' ? 'h-full w-full' : 'max-h-none max-w-none'}
              // Away from "fit" the sheet is sized as a percentage of the stage, so zooming in grows the mark
              // past the sheet and the stage clips it — the same behaviour the image had.
              style={zoom === 'fit' ? undefined : { width: `${zoom * 100}%` }}
              // Clicking the sheet rather than a part clears the selection, which is the only way to
              // deselect that does not involve hunting for a control.
              onClick={() => {
                if (editMode) {
                  selectPart(null)
                }
              }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              role="img"
              aria-label={`${concept.engine} — ${concept.palette.id}`}
            >
              {parts.parts.map((part, index) => {
                const edit = edits?.[index]
                if (edit?.hidden === true) {
                  return null
                }
                const selected = editMode && selectedPart === index
                const transform = edit === undefined ? null : partTransform(part.d, edit)
                return (
                  <g key={index} transform={transform ?? undefined}>
                    <path
                      d={part.d}
                      fill={edit?.fill ?? part.fill ?? 'none'}
                      // The highlight is a stroke on a copy rather than on the part itself, so the part's
                      // own fill and geometry are untouched and the outline reads as a selection rather
                      // than as a different shape.
                      stroke={selected ? 'var(--accent)' : 'none'}
                      strokeWidth={selected ? 3 : 0}
                      strokeLinejoin="round"
                      className={editMode ? 'cursor-move' : undefined}
                      onPointerDown={onPointerDown(index)}
                    />
                  </g>
                )
              })}
            </svg>
          </motion.div>
        )}
      </div>
    </div>
  )
}
