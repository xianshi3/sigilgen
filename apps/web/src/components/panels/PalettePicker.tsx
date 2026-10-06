import { useI18n } from '../../i18n/I18nProvider'
import { ALL_PALETTES, previewColours } from '../../lib/resources'
import { useStudio } from '../../store/useStudio'
import { Disclosure } from '../primitives/Disclosure'
import { TextField } from '../primitives/TextField'

/**
 * Palette picker: the curated set as swatches, plus a free colour list.
 *
 * The swatches are the palette's own colours rather than a name, because the name is not the thing a
 * reader is choosing — `ink-monolith` and `graphite-signal` sound similar and are not. The id is in
 * the tooltip for anyone who wants it.
 */
export function PalettePicker() {
  const { t } = useI18n()
  const palette = useStudio(state => state.palette)
  const setField = useStudio(state => state.setField)

  // The text box and the swatches share one field, so whichever the reader last used stays lit. A
  // value that matches a curated palette is that palette; anything else is a colour list; an empty
  // string is the mood rules' choice.
  const curated = ALL_PALETTES.find(entry => entry.id === palette)
  const custom = curated === undefined ? previewColours(palette) : null
  const isCustom = curated === undefined && palette.trim() !== ''

  return (
    <Disclosure
      title={t('resource.palette')}
      summary={curated?.id ?? (isCustom ? t('resource.custom') : t('resource.auto'))}
      defaultOpen
    >
      <div className="flex flex-col gap-2.5">
        <SwatchGrid selected={palette} onSelect={id => setField('palette', id)} />

        <TextField
          id="field-palette-custom"
          label={t('resource.custom')}
          hint={
            isCustom && custom === null ? t('resource.customInvalid') : t('resource.customHint')
          }
          value={isCustom ? palette : ''}
          autoComplete="off"
          spellCheck={false}
          placeholder="ink, copper"
          onChange={event => {
            setField('palette', event.currentTarget.value)
          }}
        />

        {custom !== null ? (
          <ColourPreview
            primary={custom.primary}
            secondary={custom.secondary}
            accent={custom.accent}
          />
        ) : null}
      </div>
    </Disclosure>
  )
}

interface SwatchGridProps {
  selected: string
  onSelect: (id: string) => void
}

/**
 * The curated palettes as a grid of colour bands.
 *
 * Each cell shows the palette's real colours in the order the engines use them, so a reader sees the
 * pairing rather than trusting the name. The bands get distinct widths rather than equal thirds: an
 * equal split claims three equal roles, and the whole point of a primary/secondary/accent system is
 * that they are not equal.
 */
function SwatchGrid({ selected, onSelect }: SwatchGridProps) {
  const { t } = useI18n()
  const auto = selected.trim() === ''

  return (
    <div role="radiogroup" aria-label={t('resource.palette')} className="grid grid-cols-6 gap-1.5">
      <Swatch
        label={t('resource.auto')}
        title={t('resource.autoHint')}
        selected={auto}
        onClick={() => {
          onSelect('')
        }}
      />
      {ALL_PALETTES.map(palette => (
        <Swatch
          key={palette.id}
          label={palette.id}
          title={palette.id}
          selected={selected === palette.id}
          colours={[palette.primary, palette.secondary, palette.highlight ?? palette.accent]}
          onClick={() => {
            onSelect(palette.id)
          }}
        />
      ))}
    </div>
  )
}

interface SwatchProps {
  /** Accessible name, and the tooltip when no colours are shown. */
  label: string
  title: string
  selected: boolean
  /** Primary to accent. Absent draws the empty "automatic" marker instead. */
  colours?: readonly string[]
  onClick: () => void
}

function Swatch({ label, title, selected, colours, onClick }: SwatchProps) {
  // The hairline ring is not decoration. A swatch is a picture of the palette's own colours, and some
  // of them are the same white as the panel — `ivory, snow, linen` would otherwise be a blank square,
  // which is not a choice a reader can evaluate.
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={`relative aspect-square overflow-hidden rounded-chip
        shadow-[0_0_0_0.5px_var(--hairline-strong)]
        transition-shadow duration-fast ease-apple
        ${selected ? 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)]' : ''}
        hover:shadow-[var(--shadow-card)]`}
    >
      {colours === undefined ? (
        <span className="flex h-full w-full items-center justify-center bg-[var(--surface-sunken)]">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full border-2 ${selected ? 'border-[var(--accent)]' : 'border-ink-faint'}`}
          />
        </span>
      ) : (
        <span className="flex h-full w-full flex-col">
          {/* Widths 3/2/1, matching how much of a mark each colour actually occupies. */}
          <Band colour={colours[0] ?? 'transparent'} flex={3} />
          <Band colour={colours[1] ?? 'transparent'} flex={2} />
          <Band colour={colours[2] ?? 'transparent'} flex={1} />
        </span>
      )}
    </button>
  )
}

interface BandProps {
  colour: string
  /** Relative height of this band. */
  flex: number
}

function Band({ colour, flex }: BandProps) {
  return <span className="block w-full" style={{ background: colour, flex }} />
}

interface ColourPreviewProps {
  primary: string
  secondary: string
  accent: string
}

/** The colours as they will actually be used, with their hex values for reference. */
function ColourPreview({ primary, secondary, accent }: ColourPreviewProps) {
  return (
    <div className="flex items-center gap-1.5">
      {[primary, secondary, accent].map(colour => (
        <span
          key={colour}
          // A ring of its own rather than the card shadow, because one of these colours may be white
          // and the shadow's half-pixel hairline is not enough to hold an edge against a light panel.
          className="h-4 w-4 rounded-chip shadow-[0_0_0_0.5px_var(--hairline-strong)]"
          style={{ background: colour }}
          title={colour}
        />
      ))}
    </div>
  )
}
