import { useState, type ReactNode } from 'react'
import { renderScene, type LogoScene, type SceneElement } from '@sigilgen/scene'
import { useI18n } from '../../i18n/I18nProvider'
import { ALL_FONTS, ALL_ICONS } from '../../lib/resources'
import type { SceneElementPatch } from '../../lib/sceneEdit'
import { copyText, downloadJson, fileStem, saveSvg } from '../../lib/export'
import { useStudio } from '../../store/useStudio'
import { Button } from '../primitives/Button'
import { NumberField } from '../primitives/NumberField'
import { RangeField } from '../primitives/RangeField'
import { Section } from '../primitives/Section'
import { SelectField } from '../primitives/SelectField'
import { TextField } from '../primitives/TextField'
import { ScenePaintField } from './ScenePaintField'
import { SwatchGrid } from './PalettePicker'

interface GeometryFieldsProps {
  element: SceneElement
  scene: LogoScene
  offsetX: number
  offsetY: number
  update: (patch: SceneElementPatch) => void
  beginEdit: () => void
}

/** The type-specific coordinate fields. Common styling lives in the inspector below them. */
function GeometryFields({
  element,
  scene,
  offsetX,
  offsetY,
  update,
  beginEdit,
}: GeometryFieldsProps) {
  const { t } = useI18n()
  const field = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    options: { min?: number; max?: number; step?: number } = {}
  ): ReactNode => (
    <NumberField
      label={label}
      value={value}
      onChange={onChange}
      onFocus={beginEdit}
      min={options.min}
      max={options.max}
      step={options.step}
    />
  )

  switch (element.type) {
    case 'rect':
      return (
        <>
          {field(t('scene.x'), element.x + offsetX, value => update({ x: value - offsetX }))}
          {field(t('scene.y'), element.y + offsetY, value => update({ y: value - offsetY }))}
          {field(t('scene.width'), element.width, value => update({ width: Math.max(1, value) }), {
            min: 1,
          })}
          {field(
            t('scene.height'),
            element.height,
            value => update({ height: Math.max(1, value) }),
            {
              min: 1,
            }
          )}
          {field(t('scene.corner'), element.rx ?? 0, value => update({ rx: Math.max(0, value) }), {
            min: 0,
          })}
        </>
      )
    case 'circle':
      return (
        <>
          {field(t('scene.x'), element.cx + offsetX, value => update({ cx: value - offsetX }))}
          {field(t('scene.y'), element.cy + offsetY, value => update({ cy: value - offsetY }))}
          {field(t('scene.r'), element.r, value => update({ r: Math.max(0.5, value) }), {
            min: 0.5,
          })}
        </>
      )
    case 'ellipse':
      return (
        <>
          {field(t('scene.x'), element.cx + offsetX, value => update({ cx: value - offsetX }))}
          {field(t('scene.y'), element.cy + offsetY, value => update({ cy: value - offsetY }))}
          {field(t('scene.rx'), element.rx, value => update({ rx: Math.max(0.5, value) }), {
            min: 0.5,
          })}
          {field(t('scene.ry'), element.ry, value => update({ ry: Math.max(0.5, value) }), {
            min: 0.5,
          })}
        </>
      )
    case 'star':
      return (
        <>
          {field(t('scene.x'), element.cx + offsetX, value => update({ cx: value - offsetX }))}
          {field(t('scene.y'), element.cy + offsetY, value => update({ cy: value - offsetY }))}
          {field(t('scene.outer'), element.outer, value => update({ outer: Math.max(1, value) }), {
            min: 1,
          })}
          {field(
            t('scene.inner'),
            element.inner,
            value => update({ inner: Math.max(0.5, value) }),
            {
              min: 0.5,
            }
          )}
          {field(
            t('scene.points'),
            element.points,
            value => update({ points: Math.max(3, Math.min(24, Math.round(value))) }),
            { min: 3, max: 24, step: 1 }
          )}
        </>
      )
    case 'ring':
      return (
        <>
          {field(t('scene.x'), element.cx + offsetX, value => update({ cx: value - offsetX }))}
          {field(t('scene.y'), element.cy + offsetY, value => update({ cy: value - offsetY }))}
          {field(t('scene.rx'), element.rx, value => update({ rx: Math.max(1, value) }), {
            min: 1,
          })}
          {field(t('scene.ry'), element.ry, value => update({ ry: Math.max(1, value) }), {
            min: 1,
          })}
          {field(
            t('scene.weight'),
            element.weight,
            value => update({ weight: Math.max(0.5, value) }),
            {
              min: 0.5,
            }
          )}
        </>
      )
    case 'polygon':
      return (
        <>
          {field(t('scene.offsetX'), offsetX, value => update({ translate: [value, offsetY] }))}
          {field(t('scene.offsetY'), offsetY, value => update({ translate: [offsetX, value] }))}
        </>
      )
    case 'path':
      return (
        <>
          {field(t('scene.offsetX'), offsetX, value => update({ translate: [value, offsetY] }))}
          {field(t('scene.offsetY'), offsetY, value => update({ translate: [offsetX, value] }))}
        </>
      )
    case 'text':
      return (
        <>
          {field(t('scene.x'), element.x + offsetX, value => update({ x: value - offsetX }))}
          {field(t('scene.y'), element.y + offsetY, value => update({ y: value - offsetY }))}
          {field(t('scene.width'), element.width, value => update({ width: Math.max(1, value) }), {
            min: 1,
          })}
          {field(
            t('scene.height'),
            element.height,
            value => update({ height: Math.max(1, value) }),
            {
              min: 1,
            }
          )}
          <SelectField
            label={t('scene.font')}
            value={element.font ?? scene.font ?? 'inter-bold'}
            options={ALL_FONTS.map(font => ({
              value: font.id,
              label: `${font.family} · ${font.weight}`,
            }))}
            onChange={value => update({ font: value })}
          />
        </>
      )
    case 'icon':
      return (
        <>
          {field(t('scene.x'), element.x + offsetX, value => update({ x: value - offsetX }))}
          {field(t('scene.y'), element.y + offsetY, value => update({ y: value - offsetY }))}
          {field(t('scene.size'), element.size, value => update({ size: Math.max(1, value) }), {
            min: 1,
          })}
          <SelectField
            label={t('scene.icon')}
            value={element.key}
            options={ALL_ICONS.map(icon => ({ value: icon.key, label: icon.key }))}
            onChange={value => update({ key: value })}
          />
        </>
      )
  }
}

/**
 * What is selected in the drawing, and how to change it.
 *
 * The coordinate fields show the element where the reader sees it, not its base geometry plus a separate
 * offset. A drag stores a translation so a path does not have to be rewritten; the field subtracts that
 * offset when the reader types an absolute value, so both routes move the same shape to the same place.
 */
export function SceneInspector() {
  const { t } = useI18n()
  const scene = useStudio(state => state.scene)
  const selection = useStudio(state => state.sceneSelection)
  const beginEdit = useStudio(state => state.beginEdit)
  const updateElement = useStudio(state => state.updateSceneElement)
  const removeElement = useStudio(state => state.removeSceneElement)
  const duplicate = useStudio(state => state.duplicateSceneElementById)
  const setPalette = useStudio(state => state.setScenePalette)
  const setBackground = useStudio(state => state.setSceneBackground)
  const setSize = useStudio(state => state.setSceneSize)
  const setFont = useStudio(state => state.setSceneFont)
  const setTitle = useStudio(state => state.setSceneTitle)
  const name = useStudio(state => state.name)

  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  if (scene === null) {
    return (
      <Section title={t('scene.inspector')}>
        <p className="type-caption text-ink-faint">{t('scene.noScene')}</p>
      </Section>
    )
  }

  const selected =
    selection === null ? undefined : scene.elements.find(element => element.id === selection)
  const offsetX = selected?.translate?.[0] ?? 0
  const offsetY = selected?.translate?.[1] ?? 0
  const stem = fileStem(scene.title?.trim() || name || 'scene')
  const update = (patch: SceneElementPatch): void => {
    if (selected === undefined) {
      return
    }
    updateElement(selected.id, patch)
  }

  return (
    <>
      <Section title={t('scene.canvas')}>
        <TextField
          id="scene-title"
          label={t('scene.title')}
          value={scene.title ?? ''}
          onFocus={beginEdit}
          onChange={event => {
            setTitle(event.currentTarget.value)
          }}
        />
        <SelectField
          label={t('scene.size')}
          value={String(scene.size)}
          options={[...new Set([256, 512, 1024, 2048, scene.size])]
            .toSorted((a, b) => a - b)
            .map(size => ({ value: String(size), label: `${size} × ${size}` }))}
          onChange={value => {
            setSize(Number(value))
          }}
        />
        <div className="flex flex-col gap-1.5">
          <span className="type-caption text-ink-soft">{t('scene.palette')}</span>
          <SwatchGrid selected={scene.palette ?? ''} onSelect={setPalette} allowAuto={false} />
        </div>
        <SelectField
          label={t('scene.defaultFont')}
          value={scene.font ?? 'inter-bold'}
          options={ALL_FONTS.map(font => ({
            value: font.id,
            label: `${font.family} · ${font.weight}`,
          }))}
          onChange={setFont}
        />
        <ScenePaintField
          label={t('scene.background')}
          value={scene.background ?? 'none'}
          fallback="none"
          scene={scene}
          allowNone
          onBegin={beginEdit}
          onChange={value => {
            setBackground(value === 'none' ? null : value)
          }}
        />
      </Section>

      <Section
        title={t('scene.selection')}
        action={
          selected === undefined ? undefined : (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="secondary"
                title={t('scene.duplicate')}
                onClick={() => {
                  duplicate(selected.id)
                }}
              >
                ⧉
              </Button>
              <Button
                size="sm"
                variant="secondary"
                title={t('scene.delete')}
                onClick={() => {
                  removeElement(selected.id)
                }}
              >
                ×
              </Button>
            </div>
          )
        }
      >
        {selected === undefined ? (
          <p className="type-caption text-ink-faint">{t('scene.pick')}</p>
        ) : (
          <>
            <TextField
              id="scene-element-name"
              label={t('scene.layerName')}
              value={selected.name ?? ''}
              onFocus={beginEdit}
              onChange={event => {
                update({ name: event.currentTarget.value })
              }}
            />
            {selected.type === 'text' ? (
              <TextField
                id="scene-element-text"
                label={t('scene.text')}
                value={selected.text}
                onFocus={beginEdit}
                onChange={event => {
                  const next = event.currentTarget.value
                    .toUpperCase()
                    .replace(/[^A-Z ]+/g, '')
                    .slice(0, 80)
                  if (/[A-Z]/.test(next)) {
                    update({ text: next })
                  }
                }}
              />
            ) : null}
            <div className="flex flex-col gap-1.5">
              <GeometryFields
                element={selected}
                scene={scene}
                offsetX={offsetX}
                offsetY={offsetY}
                update={update}
                beginEdit={beginEdit}
              />
            </div>

            <ScenePaintField
              label={t('scene.fill')}
              value={selected.fill}
              fallback="primary"
              scene={scene}
              allowNone
              onBegin={beginEdit}
              onChange={value => update({ fill: value })}
            />
            <ScenePaintField
              label={t('scene.stroke')}
              value={selected.stroke}
              fallback="none"
              scene={scene}
              allowNone
              onBegin={beginEdit}
              onChange={value => update({ stroke: value })}
            />
            {selected.stroke !== undefined && selected.stroke !== 'none' ? (
              <NumberField
                label={t('scene.strokeWidth')}
                value={selected.strokeWidth ?? 2}
                min={0}
                max={80}
                step={0.5}
                onFocus={beginEdit}
                onChange={value => update({ strokeWidth: Math.max(0, value) })}
              />
            ) : null}

            <div onPointerDown={beginEdit}>
              <RangeField
                label={t('scene.opacity')}
                value={selected.opacity ?? 1}
                min={0}
                max={1}
                step={0.05}
                format={value => `${Math.round(value * 100)}%`}
                onChange={value => update({ opacity: value })}
              />
            </div>
            <div onPointerDown={beginEdit}>
              <RangeField
                label={t('scene.rotation')}
                value={selected.rotate ?? 0}
                min={-180}
                max={180}
                step={1}
                format={value => `${value}°`}
                onChange={value => update({ rotate: value })}
              />
            </div>
            <div onPointerDown={beginEdit}>
              <RangeField
                label={t('scene.scale')}
                value={selected.scale ?? 1}
                min={0.25}
                max={4}
                step={0.05}
                format={value => `${Math.round(value * 100)}%`}
                onChange={value => update({ scale: value })}
              />
            </div>
          </>
        )}
      </Section>

      <Section title={t('scene.export')}>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              void copyText(renderScene(scene)).then(ok => {
                setCopied(ok)
                setTimeout(() => {
                  setCopied(false)
                }, 1400)
              })
            }}
          >
            {copied ? t('scene.copied') : t('scene.copySvg')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={saving}
            onClick={() => {
              setSaving(true)
              void saveSvg(`${stem}.svg`, renderScene(scene))
                .then(ok => {
                  if (ok) {
                    setSaved(true)
                    setTimeout(() => {
                      setSaved(false)
                    }, 1400)
                  }
                })
                .finally(() => {
                  setSaving(false)
                })
            }}
          >
            {saved ? t('scene.saved') : t('scene.saveSvg')}
          </Button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={() => {
            downloadJson(`${stem}.scene.json`, scene)
          }}
        >
          {t('scene.saveScene')}
        </Button>
      </Section>
    </>
  )
}
