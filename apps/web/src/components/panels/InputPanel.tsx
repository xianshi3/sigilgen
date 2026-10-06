import { useI18n } from '../../i18n/I18nProvider'
import { useStudio } from '../../store/useStudio'
import { Section } from '../primitives/Section'
import { TextField } from '../primitives/TextField'

/** Brand name, keywords and brief. The three inputs that decide what the logo *is*. */
export function InputPanel() {
  const { t } = useI18n()
  const name = useStudio(state => state.name)
  const keywords = useStudio(state => state.keywords)
  const brief = useStudio(state => state.brief)
  const setField = useStudio(state => state.setField)

  return (
    <Section title={t('panel.input')}>
      <TextField
        id="field-name"
        label={t('field.name')}
        hint={t('field.nameHint')}
        value={name}
        autoComplete="off"
        spellCheck={false}
        placeholder="Acme"
        onChange={event => {
          setField('name', event.currentTarget.value)
        }}
      />
      <TextField
        id="field-keywords"
        label={t('field.keywords')}
        hint={t('field.keywordsHint')}
        value={keywords}
        autoComplete="off"
        spellCheck={false}
        placeholder="tech, minimal"
        onChange={event => {
          setField('keywords', event.currentTarget.value)
        }}
      />
      <TextField
        id="field-brief"
        label={t('field.brief')}
        hint={t('field.briefHint')}
        value={brief}
        autoComplete="off"
        spellCheck={false}
        placeholder="…"
        onChange={event => {
          setField('brief', event.currentTarget.value)
        }}
      />
    </Section>
  )
}
