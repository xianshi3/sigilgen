import type { MessageKey } from '../i18n/locales/zh'
import type { SceneElement } from '@sigilgen/scene'
import type { SceneTool } from './sceneEdit'

/** Translation keys for the drawing tools. */
export const SCENE_TOOL_KEYS: Record<SceneTool, MessageKey> = {
  select: 'scene.tool.select',
  rect: 'scene.tool.rect',
  circle: 'scene.tool.circle',
  ellipse: 'scene.tool.ellipse',
  star: 'scene.tool.star',
  ring: 'scene.tool.ring',
  text: 'scene.tool.text',
  icon: 'scene.tool.icon',
}

/** Translation keys for element types, used in the layer list and the inspector. */
export const SCENE_TYPE_KEYS: Record<SceneElement['type'], MessageKey> = {
  rect: 'scene.type.rect',
  circle: 'scene.type.circle',
  ellipse: 'scene.type.ellipse',
  polygon: 'scene.type.polygon',
  star: 'scene.type.star',
  ring: 'scene.type.ring',
  path: 'scene.type.path',
  text: 'scene.type.text',
  icon: 'scene.type.icon',
}
