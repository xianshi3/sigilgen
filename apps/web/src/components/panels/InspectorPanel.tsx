import { useState } from 'react'
import type { LogoResult } from '@sigilgen/types'
import { useI18n } from '../../i18n/I18nProvider'
import { ENGINE_LABEL } from '../../lib/engines'
import { copyText, downloadSvg, fileStem } from '../../lib/export'
import { applyEdits, emptyEdit, parseSvgParts } from '../../lib/svgParts'
import { useStudio } from '../../store/useStudio'
import { Button } from '../primitives/Button'
import { RangeField } from '../primitives/RangeField'
import { Section } from '../primitives/Section'

export interface InspectorPanelProps {
  concept: LogoResult | undefined
}

/** A label and value pair, set like a line in a specification sheet. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b border-[var(--hairline)] py-1.5
        last:border-b-0"
    >
      <dt className="type-caps shrink-0 text-ink-faint">{label}</dt>
      <dd className="type-caption min-w-0 truncate text-right text-ink" title={value}>
        {value}
      </dd>
    </div>
  )
}

/**
 * What was chosen, and how to take it away.
 *
 * The panel used to end with the generator's design notes: nine lines of English prose about the mood
 * that matched, the pools each resolver drew from, and the runner-up. They were the library's own
 * diagnostics wearing a section heading, and in a panel that already states the engine, the typeface,
 * the pictogram and the palette, they restated the outcome and buried it — the one screen in the studio
 * that read like a log rather than a tool.
 *
 * What belongs here is the answer, not the argument. `conceptNotes` still carries the audit trail, for
 * the API, the CLI's JSON output and every test that asserts on a decision.
 */
export function InspectorPanel({ concept }: InspectorPanelProps) {
  const { t } = useI18n()
  const name = useStudio(state => state.name)
  const [copied, setCopied] = useState(false)

  const editMode = useStudio(state => state.editMode)
  const setEditMode = useStudio(state => state.setEditMode)
  const selectedPart = useStudio(state => state.selectedPart)
  const selectPart = useStudio(state => state.selectPart)
  const beginEdit = useStudio(state => state.beginEdit)
  const updatePart = useStudio(state => state.updatePart)
  const undo = useStudio(state => state.undo)
  const redo = useStudio(state => state.redo)
  const resetEdits = useStudio(state => state.resetEdits)
  const canUndo = useStudio(state => state.past.length > 0)
  const canRedo = useStudio(state => state.future.length > 0)

  const parts = concept === undefined ? null : parseSvgParts(concept.svg)
  const edits = useStudio(state => (concept === undefined ? undefined : state.edits[concept.seed]))

  if (concept === undefined) {
    return (
      <Section title={t('concept.title')}>
        <p className="type-caption text-ink-faint">{t('concept.empty')}</p>
      </Section>
    )
  }

  const stem = fileStem(name)
  const selected = selectedPart === null ? null : (edits?.[selectedPart] ?? emptyEdit())
  const selectedPath = selectedPart === null ? null : (parts?.parts[selectedPart] ?? null)

  return (
    <>
      <Section
        title={t('edit.title')}
        action={
          editMode ? (
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" disabled={!canUndo} onClick={undo}>
                ↩
              </Button>
              <Button size="sm" variant="secondary" disabled={!canRedo} onClick={redo}>
                ↪
              </Button>
            </div>
          ) : undefined
        }
      >
        <Button
          size="sm"
          variant={editMode ? 'primary' : 'secondary'}
          className="w-full"
          onClick={() => setEditMode(!editMode)}
        >
          {editMode ? t('edit.done') : t('edit.start')}
        </Button>

        {editMode ? (
          <>
            {/* The parts, so one can be picked without hitting it on the canvas — which is hard when a
                part is small or sits behind another. */}
            <div className="flex flex-col gap-1">
              {parts?.parts.map((part, index) => {
                const edit = edits?.[index]
                const active = selectedPart === index
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => selectPart(index)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors
                      ${active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-sunken)]'}`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 rounded-swatch shadow-[0_0_0_0.5px_var(--hairline)]"
                      style={{ background: edit?.fill ?? part.fill ?? 'transparent' }}
                    />
                    <span className="type-caption min-w-0 flex-1 truncate text-ink-soft">
                      {t('edit.part', { index: index + 1 })}
                    </span>
                    {edit?.hidden === true ? (
                      <span className="type-caption text-ink-faint">{t('edit.hidden')}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {selectedPart !== null && selected !== null && selectedPath !== null ? (
              <>
                {/* The slider wrapper takes the pointer-down so a whole drag is one undo step. Without it
                    every intermediate value would be recorded and undo would step back a pixel at a time. */}
                <div onPointerDown={beginEdit}>
                  <RangeField
                    label={t('edit.rotate')}
                    value={selected.rotate}
                    min={-180}
                    max={180}
                    step={1}
                    format={value => `${value}°`}
                    onChange={value => updatePart(concept.seed, selectedPart, { rotate: value })}
                  />
                </div>
                <div onPointerDown={beginEdit}>
                  <RangeField
                    label={t('edit.scale')}
                    value={selected.scale}
                    min={0.25}
                    max={4}
                    step={0.05}
                    format={value => `${Math.round(value * 100)}%`}
                    onChange={value => updatePart(concept.seed, selectedPart, { scale: value })}
                  />
                </div>

                <label className="flex items-center justify-between gap-2">
                  <span className="type-caption text-ink-soft">{t('edit.fill')}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selected.fill ?? selectedPath.fill ?? '#000000'}
                      onChange={event => {
                        beginEdit()
                        updatePart(concept.seed, selectedPart, { fill: event.currentTarget.value })
                      }}
                      className="h-[var(--control-h)] w-12 cursor-pointer rounded-control border-0
                        bg-transparent p-0"
                      aria-label={t('edit.fill')}
                    />
                    {selected.fill !== null ? (
                      <button
                        type="button"
                        className="type-caption text-ink-faint underline-offset-2 hover:underline"
                        onClick={() => {
                          beginEdit()
                          updatePart(concept.seed, selectedPart, { fill: null })
                        }}
                      >
                        {t('edit.resetFill')}
                      </button>
                    ) : null}
                  </span>
                </label>

                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      beginEdit()
                      updatePart(concept.seed, selectedPart, { hidden: selected.hidden !== true })
                    }}
                  >
                    {selected.hidden === true ? t('edit.show') : t('edit.hide')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => resetEdits(concept.seed)}
                  >
                    {t('edit.resetAll')}
                  </Button>
                </div>
              </>
            ) : (
              <p className="type-caption text-ink-faint">{t('edit.pick')}</p>
            )}
          </>
        ) : null}
      </Section>

      <Section title={t('concept.title')}>
        <dl className="flex flex-col gap-1.5">
          <Row label={t('concept.engine')} value={t(ENGINE_LABEL[concept.engine])} />
          <Row
            label={t('concept.font')}
            value={`${concept.font.family} · ${concept.font.weight}`}
          />
          <Row
            label={t('concept.icon')}
            value={concept.icon === null ? t('concept.none') : concept.icon.key}
          />
          {/* The palette's name, not only its swatches. Each concept in a run draws its own palette
              from the mood pool, so the left panel's selection says nothing about this one. */}
          <Row label={t('concept.palette')} value={concept.palette.id} />
          <Row label={t('concept.seed')} value={concept.seed} />
        </dl>
        {/* The palette's own colours, so the choice can be judged rather than inferred from a name. */}
        <div className="mt-1 flex gap-1">
          {[
            concept.palette.primary,
            concept.palette.secondary,
            concept.palette.accent,
            ...(concept.palette.background === null ? [] : [concept.palette.background]),
          ].map((colour, index) => (
            <span
              key={`${colour}-${index}`}
              title={colour}
              className="h-5 flex-1 rounded-swatch shadow-[0_0_0_0.5px_var(--hairline)]"
              style={{ background: colour }}
            />
          ))}
        </div>
      </Section>

      <Section title={t('action.export')}>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              void copyText(concept.svg).then(ok => {
                setCopied(ok)
                setTimeout(() => {
                  setCopied(false)
                }, 1400)
              })
            }}
          >
            {copied ? t('action.copied') : t('action.copySvg')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              downloadSvg(concept, stem, applyEdits(concept.svg, edits ?? []))
            }}
          >
            {t('action.downloadSvg')}
          </Button>
        </div>
      </Section>
    </>
  )
}
