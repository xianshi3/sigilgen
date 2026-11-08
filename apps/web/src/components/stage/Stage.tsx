import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { pathBounds } from '@sigilgen/path'
import type { LogoResult } from '@sigilgen/types'
import type { MessageKey } from '../../i18n/locales/zh'
import { useI18n } from '../../i18n/I18nProvider'
import { MIN_CONTRAST, readPaper, worstContrast } from '../../lib/contrast'
import { bestPaletteFor } from '../../lib/resources'
import { emptyEdit, parseSvgParts, partTransform } from '../../lib/svgParts'
import { snapDrag, type ScreenBox } from '../../lib/snapping'
import { DURATION_BASE, EASE_APPLE } from '../../lib/motion'
import { paperIsDark, useStudio, type Backdrop } from '../../store/useStudio'
import { ReadabilityNotice } from './ReadabilityNotice'

export interface StageProps {
  concept: LogoResult | undefined
  /** Set when generation failed; the stage explains it instead of showing a mark. */
  errorKey: MessageKey | null
  errorDetail: string | null
  /** Zero-based concept index, shown oversized in the corner the way a catalogue numbers a plate. */
  index?: number
  /** How many concepts this run produced. */
  total?: number
}

/**
 * Reads a DOM rectangle into the screen-space shape the snapper uses.
 *
 * @param rect - The rectangle.
 * @returns Its four edges.
 */
function toScreenBox(rect: DOMRect): ScreenBox {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

/** Backdrop fills. Fixed paper colours, not themed tokens — see `--paper-light` in the token sheet. */
export const BACKDROP_STYLE: Record<Backdrop, string> = {
  light: 'bg-[var(--paper-light)]',
  dark: 'bg-[var(--paper-dark)]',
  board: 'bg-[var(--paper-checker-b)]',
}

/** Which sort of paper each backdrop is, so the ink drawn on it can follow the paper. See `--sheet-ink`. */
export const BACKDROP_PAPER: Record<Backdrop, 'light' | 'dark'> = {
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
export function Stage({ concept, errorKey, errorDetail, index = 0, total = 1 }: StageProps) {
  const { t } = useI18n()
  const backdrop = useStudio(state => state.backdrop)
  const zoom = useStudio(state => state.zoom)
  const editMode = useStudio(state => state.editMode)
  const selectedPart = useStudio(state => state.selectedPart)
  const selectPart = useStudio(state => state.selectPart)
  const beginEdit = useStudio(state => state.beginEdit)
  const updatePart = useStudio(state => state.updatePart)
  const snap = useStudio(state => state.snap)
  const setField = useStudio(state => state.setField)
  const pinnedPalette = useStudio(state => state.palette)

  const svgRef = useRef<SVGSVGElement>(null)
  // Selection is not an edit and does not travel between concepts: part 2 in one concept is a different
  // shape in the next. A lingering highlight would point at the wrong part after a switch or a reroll.
  const activeSeed = concept?.seed
  useEffect(() => {
    if (activeSeed === undefined) {
      return
    }
    useStudio.getState().selectPart(null)
  }, [activeSeed])
  // An edit session's drag: where it started, the part's transform at that moment, and whether the
  // pointer has moved far enough yet to count as a drag rather than as a click.
  const drag = useRef<{
    startX: number
    startY: number
    dx: number
    dy: number
    engaged: boolean
    base: ScreenBox
    canvas: ScreenBox
    others: ScreenBox[]
  } | null>(null)
  /** How far the pointer must travel, in screen pixels, for a drag to count rather than a click. */
  const DRAG_THRESHOLD_PX = 4
  /** How close, in screen pixels, an edge or centre must come to a guide before it snaps. */
  const SNAP_THRESHOLD_PX = 6
  /** The active alignment guides, in SVG user units. */
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  })

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
    // Only the inks that actually sit on the paper.
    //
    // A mark can reverse type or a pictogram out of a filled plate — the white apple inside a black badge
    // — and that white is painted on the plate, not on the sheet. Measuring every fill against the sheet
    // reported 1.4:1 for a mark whose every visible edge was high contrast, and no backdrop could make the
    // warning go away because the white was never the problem.
    //
    // A part enclosed by a strictly larger one is on that one. Strictly larger, so two parts sharing a
    // box do not exclude each other.
    const boxes = parts.parts.map(part => ({ fill: part.fill, box: pathBounds(part.d) }))
    const onPaper = boxes.filter((part, partIndex) => {
      const box = part.box
      if (box === null) {
        return true
      }
      return !boxes.some((other, otherIndex) => {
        if (otherIndex === partIndex) {
          return false
        }
        const outer = other.box
        if (outer === null) {
          return false
        }
        const wider = outer.maxX - outer.minX > box.maxX - box.minX + 2
        const taller = outer.maxY - outer.minY > box.maxY - box.minY + 2
        const covers =
          outer.minX <= box.minX + 1 &&
          outer.maxX >= box.maxX - 1 &&
          outer.minY <= box.minY + 1 &&
          outer.maxY >= box.maxY - 1
        return covers && (wider || taller)
      })
    })
    return worstContrast(
      onPaper
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
          // Whether the sheet on screen is the one this palette declares for itself. If it is, switching
          // sheets cannot help, and the notice has to say so instead of blaming the backdrop.
          cause:
            concept === undefined ||
            paperIsDark(concept.palette.background) === (backdrop === 'dark')
              ? ('paper' as const)
              : ('sheet' as const),
        }
      : null

  const onPointerDown =
    (partIndex: number) =>
    (event: React.PointerEvent): void => {
      if (!editMode || concept === undefined || parts === null) {
        return
      }
      event.stopPropagation()
      selectPart(partIndex)
      // No snapshot here: a click that selects a part is not an edit, and every pointer-down used to push
      // one, filling the history with steps that revert nothing. The snapshot is taken in onPointerMove,
      // once the pointer has actually travelled.
      const svg = svgRef.current
      if (svg === null || parts === null) {
        return
      }
      const base = event.currentTarget.getBoundingClientRect()
      const canvas = svg.getBoundingClientRect()
      const others = [...svg.querySelectorAll<SVGPathElement>('path[data-part-index]')]
        .filter(path => Number(path.dataset['partIndex']) !== partIndex)
        .map(path => path.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0)
        .map(rect => toScreenBox(rect))
      const edit = edits?.[partIndex] ?? emptyEdit()
      drag.current = {
        startX: event.clientX,
        startY: event.clientY,
        dx: edit.dx,
        dy: edit.dy,
        engaged: false,
        base: toScreenBox(base),
        canvas: toScreenBox(canvas),
        others,
      }
      setGuides({ x: null, y: null })
      svg.setPointerCapture(event.pointerId)
    }

  const onPointerMove = (event: React.PointerEvent): void => {
    const active = drag.current
    if (active === null || concept === undefined || parts === null || selectedPart === null) {
      return
    }
    const deltaX = event.clientX - active.startX
    const deltaY = event.clientY - active.startY
    // Below the threshold the pointer is hovering on the way to somewhere else: moving the part a
    // fraction of a pixel is worse than moving it not at all, and every pointer-down used to push an
    // undo snapshot on top of that. The drag engages once, then stays engaged for the gesture.
    if (!active.engaged && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
      return
    }

    const width = active.canvas.right - active.canvas.left
    const height = active.canvas.bottom - active.canvas.top
    const snapped =
      snap && width > 0 && height > 0
        ? snapDrag({
            moving: active.base,
            targets: active.others,
            canvas: active.canvas,
            deltaX,
            deltaY,
            threshold: SNAP_THRESHOLD_PX,
          })
        : { deltaX, deltaY, guideX: null, guideY: null }

    const scaleX = width > 0 ? parts.viewBox[2] / width : 1
    const scaleY = height > 0 ? parts.viewBox[3] / height : 1
    const nextDx = Math.round((active.dx + snapped.deltaX * scaleX) * 100) / 100
    const nextDy = Math.round((active.dy + snapped.deltaY * scaleY) * 100) / 100
    setGuides({
      x:
        snapped.guideX === null || width <= 0
          ? null
          : parts.viewBox[0] + ((snapped.guideX - active.canvas.left) / width) * parts.viewBox[2],
      y:
        snapped.guideY === null || height <= 0
          ? null
          : parts.viewBox[1] + ((snapped.guideY - active.canvas.top) / height) * parts.viewBox[3],
    })
    // Snapping can hold the part exactly where it was for the first few pixels of a gesture. That is a
    // guide being shown, not an edit: pushing a snapshot and a patch that both say "unchanged" would hand
    // the reader an undo step that reverts nothing.
    if (nextDx === active.dx && nextDy === active.dy) {
      return
    }
    if (!active.engaged) {
      active.engaged = true
      // One snapshot for the whole drag, taken before the first actual move — undo restores the position
      // the part was in before it moved, not one pixel into it, and clicks produce no step at all.
      beginEdit()
    }
    updatePart(concept.seed, selectedPart, { dx: nextDx, dy: nextDy })
  }

  const endDrag = (): void => {
    drag.current = null
    setGuides({ x: null, y: null })
  }

  return (
    <div className="[container-type:size] relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5 sm:p-10">
      <div
        // Sized as a square that fits whichever axis runs out first: `min(100cqw, 100cqh)` is
        // `min(width, height)` of the stage's content box. Percentage widths cannot express this —
        // `width: 100%` only ever resolves against the width — and `aspect-square` does not help
        // either: it is ignored once both axes are constrained, and a flex item's width is settled by
        // the flex algorithm before aspect-ratio ever runs. That combination left a 1376x635
        // "square" on a wide stage, which letterboxed the mark at "fit" and broke zoom centring.
        className={`relative flex aspect-square w-[min(100cqw,100cqh)] items-center justify-center
          overflow-hidden rounded-panel ${BACKDROP_STYLE[backdrop]} shadow-[var(--shadow-lift)]
          animate-[stage-drift_18s_ease-in-out_infinite]`}
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
              {parts.parts.map((part, pathIndex) => {
                const edit = edits?.[pathIndex] ?? emptyEdit()
                if (edit.hidden) {
                  return null
                }
                const selected = editMode && selectedPart === pathIndex
                const transform = partTransform(part.d, edit)
                return (
                  <g key={pathIndex} transform={transform ?? undefined}>
                    <path
                      d={part.d}
                      data-part-index={pathIndex}
                      fill={edit?.fill ?? part.fill ?? 'none'}
                      // The highlight is a stroke on a copy rather than on the part itself, so the part's
                      // own fill and geometry are untouched and the outline reads as a selection rather
                      // than as a different shape.
                      stroke={selected ? 'var(--sheet-accent)' : 'none'}
                      strokeWidth={selected ? 3 : 0}
                      strokeLinejoin="round"
                      className={editMode ? 'cursor-move' : undefined}
                      onPointerDown={onPointerDown(pathIndex)}
                    />
                  </g>
                )
              })}
              {/* Alignment guides. Drawn after the parts so the line is never hidden behind a shape, and
                  inert so it cannot intercept the pointer that is dragging. */}
              {guides.x === null ? null : (
                <line
                  x1={guides.x}
                  y1={parts.viewBox[1]}
                  x2={guides.x}
                  y2={parts.viewBox[1] + parts.viewBox[3]}
                  stroke="var(--sheet-accent)"
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                  aria-hidden="true"
                />
              )}
              {guides.y === null ? null : (
                <line
                  x1={parts.viewBox[0]}
                  y1={guides.y}
                  x2={parts.viewBox[0] + parts.viewBox[2]}
                  y2={guides.y}
                  stroke="var(--sheet-accent)"
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                  aria-hidden="true"
                />
              )}
            </svg>
          </motion.div>
        )}
      </div>

      {/* The stage reads as a plate in a catalogue rather than as a canvas: a meta rail along the top and
          the concept number set oversized in the corner. Both are inert — the sheet underneath still takes
          the pointer — and both are hidden on a stage too narrow to carry them without crowding the mark. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between
        p-5 sm:p-8"
      >
        <span className="type-caps hidden text-ink-faint min-[480px]:inline">
          {t('stage.meta')}
        </span>
        <span className="type-caps hidden text-ink-faint tabular-nums min-[480px]:inline">
          {concept === undefined ? '' : `${concept.engine} / ${concept.palette.id}`}
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 flex items-baseline gap-2 p-5 sm:p-10">
        <span className="text-[clamp(1.75rem,7cqh,3.5rem)] font-light leading-none tabular-nums text-ink">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="type-caps text-ink-faint tabular-nums">
          / {String(total).padStart(2, '0')}
        </span>
      </div>

      {/* Outside the sheet, in the stage's own gutter. It is about the mark, but it must not be on top of
          it — see the note in the component. */}
      <AnimatePresence>
        {notice === null ? null : (
          <ReadabilityNotice
            ratio={notice.ratio}
            palette={notice.palette}
            cause={notice.cause}
            onUsePalette={id => {
              setField('palette', id)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
