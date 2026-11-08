import { useI18n } from '../../i18n/I18nProvider'
import { SCENE_TOOLS } from '../../lib/sceneEdit'
import { SCENE_TOOL_KEYS, SCENE_TYPE_KEYS } from '../../lib/sceneLabels'
import { useStudio } from '../../store/useStudio'
import { Button } from '../primitives/Button'
import { ChoiceGrid } from '../primitives/ChoiceGrid'
import { Section } from '../primitives/Section'

export interface ScenePanelProps {
  /** Replaces the scene with the generated concept currently on screen. */
  onImport: () => void
  /** Starts a blank canvas, keeping the current palette. */
  onNew: () => void
}

/**
 * The drawing tools and the layer list.
 *
 * Tools are one-shot: after a shape is placed the stage returns to the pointer, because the next thing a
 * reader wants is almost always to place it, not to stamp five more. Layers are listed front to back,
 * the way the paint order reads on screen, even though the document stores them back to front.
 */
export function ScenePanel({ onImport, onNew }: ScenePanelProps) {
  const { t } = useI18n()
  const scene = useStudio(state => state.scene)
  const tool = useStudio(state => state.sceneTool)
  const setTool = useStudio(state => state.setSceneTool)
  const selection = useStudio(state => state.sceneSelection)
  const selectElement = useStudio(state => state.selectSceneElement)
  const beginEdit = useStudio(state => state.beginEdit)
  const updateElement = useStudio(state => state.updateSceneElement)
  const removeElement = useStudio(state => state.removeSceneElement)
  const moveElement = useStudio(state => state.moveSceneElement)

  const elements = scene === null ? [] : [...scene.elements].toReversed()

  return (
    <>
      <Section title={t('scene.tools')}>
        <ChoiceGrid
          aria-label={t('scene.tools')}
          value={tool}
          options={SCENE_TOOLS.map(value => ({ value, label: t(SCENE_TOOL_KEYS[value]) }))}
          onChange={setTool}
        />
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" className="flex-1" onClick={onImport}>
            {t('scene.import')}
          </Button>
          <Button size="sm" variant="secondary" onClick={onNew}>
            {t('scene.new')}
          </Button>
        </div>
      </Section>

      <Section
        title={`${t('scene.layers')}${elements.length === 0 ? '' : ` · ${elements.length}`}`}
      >
        {elements.length === 0 ? (
          <p className="type-caption text-ink-faint">{t('scene.noElements')}</p>
        ) : (
          <ol className="flex flex-col gap-0.5">
            {elements.map((element, displayIndex) => {
              const index = elements.length - 1 - displayIndex
              const selected = selection === element.id
              const label =
                element.name?.trim() || `${t(SCENE_TYPE_KEYS[element.type])} ${index + 1}`
              return (
                <li
                  key={element.id}
                  className={`flex items-center gap-0.5 rounded-control px-1
                    ${selected ? 'bg-[var(--accent-soft)]' : ''}`}
                >
                  <button
                    type="button"
                    aria-label={element.hidden === true ? t('scene.show') : t('scene.hide')}
                    title={element.hidden === true ? t('scene.show') : t('scene.hide')}
                    onClick={() => {
                      beginEdit()
                      updateElement(element.id, { hidden: element.hidden !== true })
                    }}
                    className="flex h-7 w-6 shrink-0 items-center justify-center rounded-chip
                      text-caption text-ink-faint hover:text-ink"
                  >
                    {element.hidden === true ? '○' : '●'}
                  </button>
                  <button
                    type="button"
                    aria-current={selected}
                    onClick={() => {
                      selectElement(element.id)
                    }}
                    className={`min-w-0 flex-1 truncate py-1 text-left text-caption
                      ${selected ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    aria-label={t('scene.moveUp')}
                    title={t('scene.moveUp')}
                    disabled={index === elements.length - 1}
                    onClick={() => {
                      moveElement(element.id, 1)
                    }}
                    className="flex h-7 w-5 shrink-0 items-center justify-center rounded-chip
                      text-caption text-ink-faint hover:text-ink disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={t('scene.moveDown')}
                    title={t('scene.moveDown')}
                    disabled={index === 0}
                    onClick={() => {
                      moveElement(element.id, -1)
                    }}
                    className="flex h-7 w-5 shrink-0 items-center justify-center rounded-chip
                      text-caption text-ink-faint hover:text-ink disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={t('scene.delete')}
                    title={t('scene.delete')}
                    onClick={() => {
                      removeElement(element.id)
                    }}
                    className="flex h-7 w-5 shrink-0 items-center justify-center rounded-chip
                      text-caption text-ink-faint hover:text-ink"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </Section>
    </>
  )
}
