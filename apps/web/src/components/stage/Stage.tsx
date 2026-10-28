import { useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { LogoResult } from '@sigilgen/types'
import type { MessageKey } from '../../i18n/locales/zh'
import { useI18n } from '../../i18n/I18nProvider'
import { MIN_CONTRAST, readPaper, worstContrast } from '../../lib/contrast'
import { bestPaletteFor } from '../../lib/resources'
import { emptyEdit, parseSvgParts, partTransform } from '../../lib/svgParts'
import { DURATION_BASE, EASE_APPLE } from '../../lib/motion'
import { useStudio, type Backdrop } from '../../store/useStudio'
import { ReadabilityNotice } from './ReadabilityNotice'

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

/** Which sort of paper each backdrop is, so the ink drawn on it can follow the paper. See `--sheet-ink`. */
const BACKDROP_PAPER: Record<Backdrop, 'light' | 'dark'> = {
  light: 'light',
  dark: 'dark',
  board: 'light',
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
 * ## Why the sheet is square
 *
 * Because the artwork's own canvas is. The serializer emits `viewBox="0 0 <size> <size>"` for every mark,
 * so a sheet of any other shape could only show more empty paper: the mark would still be limited by the
 * shorter axis. Measured over 40 generated marks (five engines, eight names), the ink fills 47.6% of that
 * square on average — emblem 74%, monogram 71%, lettermark 64%, abstract 38%, wordmark 14%. Nearly all of
 * the slack is inside the canvas, where it is the engines' clear space, rather than between the canvas and
 * the paper.
 *
 * That is why a wordmark reads small, and it is not a styling bug: on a 1920x1080 stage one renders at
 * 693x138. Letting the paper follow the ink's own aspect would take it to 1268x253 — 1.83x linear, 3.35x
 * the area — at the cost of reshaping the sheet on every concept switch and making one zoom percentage
 * mean a different size per concept. Cropping the rendered viewBox to the ink is the cheaper 1.35–2.54x,
 * and the thing to know before doing it is that the export is `applyEdits(concept.svg, edits)`, which
 * keeps the original viewBox: a crop applied at render time alone would make the stage disagree with the
 * file the reader downloads.
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
  const setField = useStudio(state => state.setField)
  const pinnedPalette = useStudio(state => state.palette)

  const svgRef = useRef<SVGSVGElement>(null)
  // Where the current drag started, in user units, plus the part's transform at that moment. Stored in a
  // ref rather than state because a drag fires dozens of moves a second and none of them need a render.
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null)

  const parts = useMemo(
    () => (concept === undefined ? null : parseSvgParts(concept.svg)),
    [concept]
  )
  const edits = useStudio(state => (concept === undefined ? undefined : state.edits[concept.seed]))

  // Whether the mark can be seen where it has been put.
  //
  // The backdrop is a viewing choice, so the reader is free to make it — but most of the curated palettes
  // are drawn for a pale sheet, and choosing the dark one leaves dark ink on a near-black ground with no
  // clue as to why. Nothing is broken in that case; the mark is exactly as designed. It is simply not
  // where it was designed to be, and only the studio can say so, because only the studio knows both the
  // ink and the sheet.
  const paper = useMemo(() => readPaper(backdrop), [backdrop])
  const legibility = useMemo(() => {
    if (parts === null) {
      return null
    }
    return worstContrast(
      parts.parts
        .map(part => part.fill)
        .filter((fill): fill is string => fill !== null && fill !== 'none'),
      paper
    )
  }, [parts, paper])

  // Offered rather than applied. Recolouring the mark because of where the reader chose to look at it
  // would be a larger surprise than the one being fixed, and the palette is a design decision.
  //
  // The offer is withdrawn when it names the palette already in use: at that point the sheet is the
  // problem, not the palette, and a button that changes nothing is worse than no button. The backdrop is
  // the control next to the notice, so the reader still has somewhere to go.
  const notice =
    legibility !== null && legibility < MIN_CONTRAST
      ? {
          ratio: legibility,
          palette: bestPaletteFor(paper)?.id === pinnedPalette ? null : bestPaletteFor(paper),
        }
      : null

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
    <div className="[container-type:size] relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--stage)] p-5 sm:p-8">
      <div
        // Sized as a square that fits whichever axis runs out first: `min(100cqw, 100cqh)` is
        // `min(width, height)` of the stage's content box. Percentage widths cannot express this —
        // `width: 100%` only ever resolves against the width — and `aspect-square` does not help
        // either: it is ignored once both axes are constrained, and a flex item's width is settled by
        // the flex algorithm before aspect-ratio ever runs. That combination left a 1376x635
        // "square" on a wide stage, which letterboxed the mark at "fit" and broke zoom centring.
        className={`relative flex aspect-square w-[min(100cqw,100cqh)] items-center justify-center
          overflow-hidden rounded-panel ${BACKDROP_STYLE[backdrop]} shadow-[var(--shadow-lift)]`}
        // The paper is not the theme's, so the ink on it cannot be the theme's either. This selects the
        // matching set in the token sheet; without it the empty state measures as low as 1.45:1.
        data-paper={BACKDROP_PAPER[backdrop]}
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
            <p
              className={`type-title ${
                errorKey === null ? 'text-[var(--sheet-ink-soft)]' : 'text-[var(--sheet-ink)]'
              }`}
            >
              {errorKey === null ? t('empty.title') : t('error.title')}
            </p>
            <p className="type-body text-[var(--sheet-ink-faint)]">
              {errorKey === null ? t('empty.body') : t(errorKey)}
            </p>
            {/* No opacity on this one. `/70` against the faintest ink is a contrast cut, and it is one that
                cannot be checked against a threshold — it took the light theme's 3.59 down to about 2.4.
                Size already carries the difference between this line and the one above it. */}
            <p className="type-caption text-[var(--sheet-ink-faint)]">
              {errorKey === null ? t('empty.suggestion') : errorDetail}
            </p>
          </div>
        ) : parts === null ? null : (
          <motion.div
            // Keyed by the concept's own seed fingerprint, so switching concepts cross-fades while
            // retyping the name swaps the image without a flash.
            key={concept.seed}
            // Opacity only, no scale: a scale transform on the wrapper shrinks the SVG's rendered box
            // below the size its viewBox expects, so the content letterboxes instead of filling the
            // sheet. The image this replaced never scaled, and the cross-fade reads fine without it.
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
            // `flex items-center justify-center` so a mark smaller than the sheet (any zoom below fit)
            // stays centred in it. Without this the SVG is a block child of a non-flex container and
            // hugs the left edge, which reads as a jump the first time the reader zooms out.
            className="flex h-full w-full items-center justify-center"
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
                      stroke={selected ? 'var(--sheet-accent)' : 'none'}
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

      {/* Outside the sheet, in the stage's own gutter. It is about the mark, but it must not be on top of
          it — see the note in the component. */}
      <AnimatePresence>
        {notice === null ? null : (
          <ReadabilityNotice
            ratio={notice.ratio}
            palette={notice.palette}
            onUsePalette={id => {
              setField('palette', id)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
