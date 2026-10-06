import { ENGINE_NAMES, type EngineName } from '@sigilgen/types'
import { useI18n } from '../../i18n/I18nProvider'
import { ENGINE_HINT, ENGINE_LABEL } from '../../lib/engines'
import { useStudio } from '../../store/useStudio'
import { ChoiceGrid } from '../primitives/ChoiceGrid'
import { RangeField } from '../primitives/RangeField'
import { Section } from '../primitives/Section'
import { Toggle } from '../primitives/Toggle'

/** Engine, canvas size, concept count and background. */
export function DesignPanel() {
  const { t } = useI18n()
  const engine = useStudio(state => state.engine)
  const size = useStudio(state => state.size)
  const variations = useStudio(state => state.variations)
  const background = useStudio(state => state.background)
  const setField = useStudio(state => state.setField)

  const hint = engine === 'auto' ? t('field.engineAutoHint') : t(ENGINE_HINT[engine])

  return (
    <>
      <Section title={t('field.engine')}>
        <ChoiceGrid<EngineName | 'auto'>
          aria-label={t('field.engine')}
          value={engine}
          columns={3}
          options={[
            { value: 'auto', label: t('field.engineAuto'), title: t('field.engineAutoHint') },
            ...ENGINE_NAMES.map(name => ({
              value: name as EngineName,
              label: t(ENGINE_LABEL[name]),
              title: t(ENGINE_HINT[name]),
            })),
          ]}
          onChange={value => {
            setField('engine', value)
          }}
        />
        <p className="type-caption min-h-4 text-ink-faint">{hint}</p>
      </Section>

      <Section title={t('panel.design')}>
        <RangeField
          label={t('field.variations')}
          min={1}
          max={6}
          value={variations}
          onChange={value => {
            setField('variations', value)
          }}
        />
        <RangeField
          label={t('field.size')}
          min={64}
          max={2048}
          step={64}
          value={size}
          format={value => `${value}px`}
          onChange={value => {
            setField('size', value)
          }}
        />
        <Toggle
          label={t('field.background')}
          checked={background}
          onChange={checked => {
            setField('background', checked)
          }}
        />
      </Section>
    </>
  )
}
