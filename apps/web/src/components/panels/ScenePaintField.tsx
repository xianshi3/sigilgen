import { useI18n } from '../../i18n/I18nProvider'
import { SCENE_COLOUR_ROLES, resolveSceneColour, type LogoScene } from '@sigilgen/scene'

export interface ScenePaintFieldProps {
  label: string
  /** Current colour or role. `undefined` means the field's default. */
  value: string | undefined
  /** The role an unset value represents, e.g. `primary` for fill and `none` for stroke. */
  fallback: string
  scene: LogoScene
  onChange: (value: string) => void
  /** Whether a `none` option is offered. */
  allowNone: boolean
  /** Called once before a gesture that changes the colour, for one undo step. */
  onBegin?: () => void
}

/** A hex value the native colour input can display. */
function hexFor(value: string, scene: LogoScene): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value
  }
  const resolved = value === 'none' ? 'none' : resolveSceneColour(value, scene)
  return /^#[0-9a-f]{6}$/i.test(resolved) ? resolved : '#111111'
}

/**
 * A colour control that understands palette roles.
 *
 * Storing the role rather than the hex it resolves to is what lets a whole drawing follow a palette
 * change. The native picker is still there for a literal colour, and choosing one deliberately breaks
 * the link for that element.
 */
export function ScenePaintField({
  label,
  value,
  fallback,
  scene,
  onChange,
  allowNone,
  onBegin,
}: ScenePaintFieldProps) {
  const { t } = useI18n()
  const current = value ?? fallback
  const palette = scene.palette !== null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-caption text-ink-soft">{label}</span>
      <div className="flex items-center gap-1">
        {palette
          ? SCENE_COLOUR_ROLES.map(role => {
              const colour = resolveSceneColour(role, scene)
              return (
                <button
                  key={role}
                  type="button"
                  title={role}
                  aria-label={role}
                  aria-pressed={current === role}
                  onClick={() => {
                    onBegin?.()
                    onChange(role)
                  }}
                  className={`h-6 flex-1 rounded-chip shadow-[0_0_0_0.5px_var(--hairline-strong)]
                    transition-shadow duration-fast
                    ${current === role ? 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)]' : ''}`}
                  style={{
                    background:
                      colour === 'none'
                        ? 'repeating-conic-gradient(var(--hairline) 0% 25%, transparent 0% 50%) 50% / 8px 8px'
                        : colour,
                  }}
                />
              )
            })
          : null}
        <label
          className="relative h-6 w-8 shrink-0 cursor-pointer overflow-hidden rounded-chip
            shadow-[0_0_0_0.5px_var(--hairline-strong)]"
          title={t('scene.customColour')}
        >
          <input
            type="color"
            value={hexFor(current, scene)}
            onFocus={onBegin}
            onChange={event => {
              onChange(event.currentTarget.value)
            }}
            aria-label={t('scene.customColour')}
            className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
        {allowNone ? (
          <button
            type="button"
            aria-pressed={current === 'none'}
            onClick={() => {
              onBegin?.()
              onChange('none')
            }}
            className={`h-6 shrink-0 rounded-chip px-2 text-micro text-ink-soft
              shadow-[0_0_0_0.5px_var(--hairline-strong)] hover:text-ink
              ${current === 'none' ? 'bg-[var(--accent-soft)] text-ink' : ''}`}
          >
            {t('scene.none')}
          </button>
        ) : null}
      </div>
      {palette ? null : (
        <span className="type-caption text-ink-faint">{t('scene.roleNeedsPalette')}</span>
      )}
    </div>
  )
}
