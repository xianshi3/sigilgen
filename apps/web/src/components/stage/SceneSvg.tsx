import { createElement, type ReactNode } from 'react'
import type { SVGElement } from '@sigilgen/types'
import {
  resolveSceneColour,
  sceneElementBounds,
  sceneElementToSvg,
  sceneElementTransform,
  type LogoScene,
} from '@sigilgen/scene'

/** Renders one compiled SVG node. */
function renderNode(node: SVGElement, key: string): ReactNode {
  const children =
    node.children === undefined
      ? undefined
      : node.children.map((child, index) => renderNode(child, `${key}-${index}`))
  return createElement(
    node.tag,
    { key, ...node.attrs } as Record<string, string | number>,
    children
  )
}

export interface SceneSvgProps {
  scene: LogoScene
  /** Selected element id, or `null`. */
  selection: string | null
  /** Active alignment guides in user units. */
  guides: { x: number | null; y: number | null }
}

/**
 * The scene as live SVG.
 *
 * Generated logos are rendered from parsed paths because an image cannot be edited; a scene is already a
 * tree, so it is compiled by the same `sceneElementToSvg` that produces the exported file and rendered
 * through React. The extra `data-scene-id` wrapper is the only difference: it gives the pointer
 * something stable to grab and lets the studio measure the element without knowing its geometry.
 *
 * @param props - The scene, selection and guides.
 * @returns The drawing's child nodes.
 */
export function SceneSvg({ scene, selection, guides }: SceneSvgProps) {
  const background =
    scene.background === null ? 'none' : resolveSceneColour(scene.background, scene)
  const selected =
    selection === null ? null : scene.elements.find(element => element.id === selection)
  const bounds =
    selected === undefined || selected === null || selected.hidden === true
      ? null
      : sceneElementBounds(selected)
  return (
    <>
      {background !== 'none' ? (
        <rect x={0} y={0} width={scene.size} height={scene.size} fill={background} />
      ) : null}
      {scene.elements.map(element => {
        if (element.hidden === true) {
          return null
        }
        const node = sceneElementToSvg(element, scene)
        const transform = sceneElementTransform(element)
        const rendered =
          transform === null ? node : { tag: 'g', attrs: { transform }, children: [node] }
        return (
          <g key={element.id} data-scene-id={element.id}>
            {renderNode(rendered, element.id)}
          </g>
        )
      })}
      {bounds === null ? null : (
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          fill="none"
          stroke="var(--sheet-accent)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          aria-hidden="true"
        />
      )}
      {guides.x === null ? null : (
        <line
          x1={guides.x}
          y1={0}
          x2={guides.x}
          y2={scene.size}
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
          x1={0}
          y1={guides.y}
          x2={scene.size}
          y2={guides.y}
          stroke="var(--sheet-accent)"
          strokeWidth={1}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          aria-hidden="true"
        />
      )}
    </>
  )
}
