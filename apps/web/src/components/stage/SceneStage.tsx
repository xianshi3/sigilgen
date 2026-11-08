import { useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { SCENE_TOOL_KEYS } from '../../lib/sceneLabels'
import { createSceneElement, type SceneTool } from '../../lib/sceneEdit'
import { snapDrag, type ScreenBox } from '../../lib/snapping'
import { useStudio } from '../../store/useStudio'
import { BACKDROP_PAPER, BACKDROP_STYLE } from './Stage'
import { SceneSvg } from './SceneSvg'

/** Reads a DOM rectangle into the screen-space shape the snapper uses. */
function toScreenBox(rect: DOMRect): ScreenBox {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

/** A control's travel before it counts as a drag rather than a click, in screen pixels. */
const DRAG_THRESHOLD_PX = 4

/** How close, in screen pixels, an edge or centre must come to a guide before it snaps. */
const SNAP_THRESHOLD_PX = 6

/**
 * The drawing canvas.
 *
 * It shares the sheet, paper, zoom and snapping grammar with the generated stage, but the unit of
 * selection is a scene element rather than a parsed path. A click with a shape tool adds an element at
 * the pointer; a drag with the pointer tool moves the selected element and shows the same dashed guides
 * the generated editor uses.
 */
export function SceneStage() {
  const { t } = useI18n()
  const scene = useStudio(state => state.scene)
  const selection = useStudio(state => state.sceneSelection)
  const tool = useStudio(state => state.sceneTool)
  const backdrop = useStudio(state => state.backdrop)
  const zoom = useStudio(state => state.zoom)
  const snap = useStudio(state => state.snap)
  const name = useStudio(state => state.name)
  const beginEdit = useStudio(state => state.beginEdit)
  const updateSceneElement = useStudio(state => state.updateSceneElement)
  const addSceneElement = useStudio(state => state.addSceneElement)
  const selectSceneElement = useStudio(state => state.selectSceneElement)

  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{
    id: string
    startX: number
    startY: number
    translate: [number, number]
    base: ScreenBox
    canvas: ScreenBox
    others: ScreenBox[]
    engaged: boolean
  } | null>(null)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  })

  const sheetStyle = useMemo(
    () =>
      backdrop === 'board'
        ? {
            backgroundImage: `linear-gradient(45deg, var(--paper-checker-a) 25%, transparent 25%),
              linear-gradient(-45deg, var(--paper-checker-a) 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, var(--paper-checker-a) 75%),
              linear-gradient(-45deg, transparent 75%, var(--paper-checker-a) 75%)`,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
          }
        : undefined,
    [backdrop]
  )

  /** The pointer position in scene units. */
  const toScenePoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current
    if (svg === null || scene === null) {
      return { x: 0, y: 0 }
    }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * scene.size,
      y: ((clientY - rect.top) / rect.height) * scene.size,
    }
  }

  const onPointerDown = (event: React.PointerEvent): void => {
    if (scene === null) {
      return
    }
    if (tool !== 'select') {
      const point = toScenePoint(event.clientX, event.clientY)
      const element = createSceneElement(tool, point.x, point.y, scene, name)
      if (element !== null) {
        event.preventDefault()
        addSceneElement(element)
      }
      return
    }

    const target = (event.target as Element).closest('[data-scene-id]')
    const id = target?.getAttribute('data-scene-id') ?? null
    if (target === null || id === null) {
      selectSceneElement(null)
      return
    }
    const svg = svgRef.current
    if (svg === null) {
      return
    }
    const element = scene.elements.find(entry => entry.id === id)
    if (element === undefined) {
      return
    }
    selectSceneElement(id)
    const others = [...svg.querySelectorAll<SVGGElement>('[data-scene-id]')]
      .filter(group => group.getAttribute('data-scene-id') !== id)
      .map(group => group.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => toScreenBox(rect))
    drag.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      translate: element.translate ?? [0, 0],
      base: toScreenBox(target.getBoundingClientRect()),
      canvas: toScreenBox(svg.getBoundingClientRect()),
      others,
      engaged: false,
    }
    setGuides({ x: null, y: null })
    svg.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent): void => {
    const active = drag.current
    if (active === null || scene === null) {
      return
    }
    const deltaX = event.clientX - active.startX
    const deltaY = event.clientY - active.startY
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
    const scaleX = width > 0 ? scene.size / width : 1
    const scaleY = height > 0 ? scene.size / height : 1
    const nextTranslate: [number, number] = [
      Math.round((active.translate[0] + snapped.deltaX * scaleX) * 100) / 100,
      Math.round((active.translate[1] + snapped.deltaY * scaleY) * 100) / 100,
    ]
    setGuides({
      x:
        snapped.guideX === null || width <= 0
          ? null
          : ((snapped.guideX - active.canvas.left) / width) * scene.size,
      y:
        snapped.guideY === null || height <= 0
          ? null
          : ((snapped.guideY - active.canvas.top) / height) * scene.size,
    })
    if (nextTranslate[0] === active.translate[0] && nextTranslate[1] === active.translate[1]) {
      return
    }
    if (!active.engaged) {
      active.engaged = true
      beginEdit()
    }
    updateSceneElement(active.id, { translate: nextTranslate })
  }

  const endDrag = (): void => {
    drag.current = null
    setGuides({ x: null, y: null })
  }

  return (
    <div className="[container-type:size] relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5 sm:p-10">
      <div
        className={`relative flex aspect-square w-[min(100cqw,100cqh)] items-center justify-center
          overflow-hidden rounded-panel ${BACKDROP_STYLE[backdrop]} shadow-[var(--shadow-lift)]
          animate-[stage-drift_18s_ease-in-out_infinite]`}
        data-paper={BACKDROP_PAPER[backdrop]}
        style={sheetStyle}
      >
        {scene === null ? null : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${scene.size} ${scene.size}`}
            className={zoom === 'fit' ? 'h-full w-full' : 'max-h-none max-w-none'}
            style={zoom === 'fit' ? undefined : { width: `${zoom * 100}%` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="img"
            aria-label={t('scene.canvasLabel')}
          >
            <SceneSvg scene={scene} selection={selection} guides={guides} />
          </svg>
        )}
        {scene === null || scene.elements.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex max-w-[min(22rem,80%)] flex-col items-center justify-center gap-2 text-center">
            <p className="type-title text-[var(--sheet-ink)]">{t('scene.emptyTitle')}</p>
            <p className="type-body text-[var(--sheet-ink-faint)]">{t('scene.emptyBody')}</p>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 sm:p-8">
        <span className="type-caps hidden text-ink-faint min-[480px]:inline">
          {t('scene.meta')}
        </span>
        <span className="type-caps hidden text-ink-faint tabular-nums min-[480px]:inline">
          {scene === null ? '' : `${scene.elements.length} · ${scene.size}`}
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 flex items-baseline gap-2 p-5 sm:p-10">
        <span className="type-caps text-ink-faint">{t(SCENE_TOOL_KEYS[tool])}</span>
      </div>
    </div>
  )
}

/** Re-exported so callers can type a tool without reaching into the library. */
export type { SceneTool }
