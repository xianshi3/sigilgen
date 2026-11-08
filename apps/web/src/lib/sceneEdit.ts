import { ALL_ICONS, ALL_PALETTES } from './resources'
import { normaliseScene, type LogoScene, type SceneElement } from '@sigilgen/scene'
import { transformPath } from '@sigilgen/path'

/** The tools the draw workspace offers. `select` is the pointer; the rest create an element. */
export type SceneTool = 'select' | 'rect' | 'circle' | 'ellipse' | 'star' | 'ring' | 'text' | 'icon'

/** Every tool, in the order the toolbar lists them. */
export const SCENE_TOOLS: readonly SceneTool[] = [
  'select',
  'rect',
  'circle',
  'ellipse',
  'star',
  'ring',
  'text',
  'icon',
]

/** A patch to one scene element, as the inspector and the canvas send it. */
export interface SceneElementPatch {
  name?: string
  hidden?: boolean
  translate?: [number, number]
  rotate?: number
  scale?: number
  opacity?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  fillRule?: 'nonzero' | 'evenodd'
  x?: number
  y?: number
  width?: number
  height?: number
  rx?: number
  ry?: number
  cx?: number
  cy?: number
  r?: number
  points?: number | [number, number][]
  outer?: number
  inner?: number
  weight?: number
  d?: string
  text?: string
  font?: string
  tracking?: number
  key?: string
  size?: number
}

/**
 * Applies a patch without changing an element's identity.
 *
 * The patch type deliberately has no `type` or `id`, so a control cannot turn a circle into a path or
 * make two elements share a selection id by accident.
 *
 * @param element - The element to update.
 * @param patch - Fields to replace.
 * @returns A new element.
 */
export function applyScenePatch(element: SceneElement, patch: SceneElementPatch): SceneElement {
  return { ...element, ...patch } as SceneElement
}

/**
 * The smallest id of the form `<prefix>-<n>` not already used by the scene.
 *
 * @param scene - The scene to search.
 * @param prefix - A type or short noun, e.g. `rect`.
 * @returns A stable, unique id.
 */
export function nextSceneElementId(scene: LogoScene, prefix: string): string {
  const used = new Set(scene.elements.map(element => element.id))
  let counter = 1
  while (used.has(`${prefix}-${counter}`)) {
    counter += 1
  }
  return `${prefix}-${counter}`
}

/**
 * A blank drawing document.
 *
 * The palette is validated rather than trusted: a persisted or imported id may have been removed from
 * the brain, and a scene carrying a dangling palette would fail on its first role-coloured element.
 *
 * @param paletteId - Preferred palette id.
 * @returns A normalised empty scene, or one with no palette when the preference is unknown.
 */
export function blankScene(paletteId: string): LogoScene {
  const palette = ALL_PALETTES.find(entry => entry.id === paletteId)?.id ?? null
  return normaliseScene({
    version: 1,
    title: 'Untitled',
    size: 512,
    palette,
    font: 'inter-bold',
    background: null,
    elements: [],
  })
}

/**
 * Scales a scene to a new square canvas.
 *
 * Every coordinate, radius, text box, icon box, translation and stroke width is multiplied by the
 * ratio; a path's `d` is rewritten by the path toolkit. The composition stays centred because the old
 * canvas and the artwork scale together, which is what a reader choosing a larger size expects. The
 * alternative — keeping absolute coordinates — would leave the mark in the top-left corner.
 *
 * @param scene - The current scene.
 * @param size - The new canvas size in user units.
 * @returns A new scene at the requested size.
 */
export function resizeScene(scene: LogoScene, size: number): LogoScene {
  if (size <= 0 || size === scene.size) {
    return scene
  }
  const ratio = size / scene.size
  const scale = (value: number): number => Math.round(value * ratio * 100) / 100
  const elements = scene.elements.map((element): SceneElement => {
    const translate: [number, number] | undefined = element.translate
      ? [scale(element.translate[0]), scale(element.translate[1])]
      : undefined
    const strokeWidth = element.strokeWidth === undefined ? undefined : scale(element.strokeWidth)
    const base = {
      id: element.id,
      name: element.name,
      hidden: element.hidden,
      translate,
      rotate: element.rotate,
      scale: element.scale,
      opacity: element.opacity,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth,
      fillRule: element.fillRule,
    }
    switch (element.type) {
      case 'rect':
        return {
          ...base,
          type: 'rect',
          x: scale(element.x),
          y: scale(element.y),
          width: scale(element.width),
          height: scale(element.height),
          rx: element.rx === undefined ? undefined : scale(element.rx),
        }
      case 'circle':
        return {
          ...base,
          type: 'circle',
          cx: scale(element.cx),
          cy: scale(element.cy),
          r: scale(element.r),
        }
      case 'ellipse':
        return {
          ...base,
          type: 'ellipse',
          cx: scale(element.cx),
          cy: scale(element.cy),
          rx: scale(element.rx),
          ry: scale(element.ry),
        }
      case 'polygon':
        return {
          ...base,
          type: 'polygon',
          points: element.points.map(([x, y]) => [scale(x), scale(y)] as [number, number]),
        }
      case 'star':
        return {
          ...base,
          type: 'star',
          cx: scale(element.cx),
          cy: scale(element.cy),
          outer: scale(element.outer),
          inner: scale(element.inner),
          points: element.points,
          rotation: element.rotation,
        }
      case 'ring':
        return {
          ...base,
          type: 'ring',
          cx: scale(element.cx),
          cy: scale(element.cy),
          rx: scale(element.rx),
          ry: scale(element.ry),
          weight: scale(element.weight),
        }
      case 'path':
        return {
          ...base,
          type: 'path',
          d: transformPath(element.d, ratio, 0, 0),
        }
      case 'text':
        return {
          ...base,
          type: 'text',
          text: element.text,
          font: element.font,
          tracking: element.tracking,
          x: scale(element.x),
          y: scale(element.y),
          width: scale(element.width),
          height: scale(element.height),
        }
      case 'icon':
        return {
          ...base,
          type: 'icon',
          key: element.key,
          x: scale(element.x),
          y: scale(element.y),
          size: scale(element.size),
        }
    }
  })
  return { ...scene, size, elements }
}

/**
 * Builds the default element a tool creates at a point.
 *
 * Sizes are expressed against a 512-unit canvas and scaled to the scene, so a tool behaves the same on
 * a small or a large document. Text defaults to the current brand name, because that is the one letter
 * run the reader almost always wants and retyping it is busywork.
 *
 * @param tool - The armed tool; `select` creates nothing.
 * @param x - Click position in scene units.
 * @param y - Click position in scene units.
 * @param scene - The scene that supplies the canvas size, palette and default font.
 * @param brandName - The brand name used for a new text run.
 * @returns A new element, or `null` for the pointer tool.
 */
export function createSceneElement(
  tool: SceneTool,
  x: number,
  y: number,
  scene: LogoScene,
  brandName: string
): SceneElement | null {
  if (tool === 'select') {
    return null
  }
  const unit = scene.size / 512
  const fill = scene.palette === null ? '#111111' : 'primary'
  const id = nextSceneElementId(scene, tool)
  switch (tool) {
    case 'rect': {
      const width = 160 * unit
      const height = 100 * unit
      return {
        id,
        type: 'rect',
        name: 'Rectangle',
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
        rx: 12 * unit,
        fill,
      }
    }
    case 'circle':
      return { id, type: 'circle', name: 'Circle', cx: x, cy: y, r: 70 * unit, fill }
    case 'ellipse':
      return {
        id,
        type: 'ellipse',
        name: 'Ellipse',
        cx: x,
        cy: y,
        rx: 90 * unit,
        ry: 60 * unit,
        fill,
      }
    case 'star':
      return {
        id,
        type: 'star',
        name: 'Star',
        cx: x,
        cy: y,
        outer: 80 * unit,
        inner: 36 * unit,
        points: 5,
        rotation: -90,
        fill,
      }
    case 'ring':
      return {
        id,
        type: 'ring',
        name: 'Ring',
        cx: x,
        cy: y,
        rx: 80 * unit,
        ry: 80 * unit,
        weight: 14 * unit,
        fill,
      }
    case 'text': {
      const width = 320 * unit
      const height = 64 * unit
      const letters =
        brandName
          .toUpperCase()
          .replace(/[^A-Z ]+/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 24) || 'BRAND'
      return {
        id,
        type: 'text',
        name: letters,
        text: letters,
        font: scene.font ?? 'inter-bold',
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
        fill,
      }
    }
    case 'icon': {
      const size = 120 * unit
      const key = ALL_ICONS.some(icon => icon.key === 'hexagon-node')
        ? 'hexagon-node'
        : (ALL_ICONS[0]?.key ?? 'star-burst')
      return {
        id,
        type: 'icon',
        name: `Icon ${key}`,
        key,
        x: x - size / 2,
        y: y - size / 2,
        size,
        fill,
      }
    }
  }
}
