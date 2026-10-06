import type { EngineName } from '@sigilgen/types'
import { useI18n } from '../../i18n/I18nProvider'
import { DIMENSIONS, valueLabel } from '../../lib/dimensions'
import { useStudio, type PinnedValue } from '../../store/useStudio'
import { ChoiceGrid } from '../primitives/ChoiceGrid'
import { Section } from '../primitives/Section'

/**
 * Tri-state control per design decision.
 *
 * The engine decides which dimensions exist, because offering one the engine never reads would be a
 * control that silently does nothing. `random` is always first: releasing a dimension back to the seed
 * has to be as easy as setting it, and a pin the reader cannot take off is a trap.
 */
export function OptionPanel() {
  const { t } = useI18n()
  const engine = useStudio(state => state.engine)
  const preferences = useStudio(state => state.preferences)
  const setPreference = useStudio(state => state.setPreference)

  // On automatic there is no single engine whose dimensions could be listed, and the router may pick a
  // different one per concept. The section stays and explains itself rather than appearing empty.
  const specs = engine === 'auto' ? null : DIMENSIONS[engine as EngineName]

  return (
    <Section title={t('dimension.title')}>
      {specs === null ? (
        <p className="type-caption text-ink-faint">{t('field.engineAutoHint')}</p>
      ) : (
        specs.map(spec => (
          <div key={spec.dimension} className="flex flex-col gap-1.5">
            <span className="type-caption text-ink-soft">{t(spec.label)}</span>
            <ChoiceGrid<PinnedValue>
              aria-label={t(spec.label)}
              // Two columns, not three: the candidates are two-word phrases in one case
              // (`side-by-side`) and one word in the other (`hexagon`), and a three-column track in a
              // 288px sidebar truncates the long ones into nonsense.
              columns={2}
              value={preferences[spec.dimension] ?? 'random'}
              options={[
                { value: 'random', label: t('dimension.random') },
                ...spec.values.map(value => ({
                  value,
                  label: valueLabel(value),
                  title: valueLabel(value),
                })),
              ]}
              onChange={value => {
                setPreference(spec.dimension, value)
              }}
            />
          </div>
        ))
      )}
      <p className="type-caption text-ink-faint">{t('dimension.hint')}</p>
    </Section>
  )
}
