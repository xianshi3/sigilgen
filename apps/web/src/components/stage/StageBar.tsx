import { useI18n } from '../../i18n/I18nProvider'
import { useStudio, type Backdrop } from '../../store/useStudio'
import { Button } from '../primitives/Button'
import { Segmented } from '../primitives/Segmented'

/**
 * Controls for what is on the stage.
 *
 * These describe the view rather than the design, so they sit between the canvas and the concept strip
 * rather than in a side panel: the backdrop decides how the mark reads, and the zoom decides how much
 * of it is being read.
 */
export function StageBar() {
  const { t } = useI18n()
  const backdrop = useStudio(state => state.backdrop)
  const setBackdrop = useStudio(state => state.setBackdrop)
  const zoom = useStudio(state => state.zoom)
  const setZoom = useStudio(state => state.setZoom)
  const zoomBy = useStudio(state => state.zoomBy)

  return (
    <div className="hairline-t flex items-center justify-between gap-3 px-gutter py-2.5">
      <Segmented<Backdrop>
        aria-label={t('stage.backdrop')}
        value={backdrop}
        options={[
          { value: 'light', label: t('stage.backdropLight') },
          { value: 'dark', label: t('stage.backdropDark') },
          { value: 'board', label: t('stage.backdropBoard') },
        ]}
        onChange={setBackdrop}
      />

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          title={t('stage.zoomOut')}
          aria-label={t('stage.zoomOut')}
          onClick={() => {
            zoomBy(-0.25)
          }}
        >
          −
        </Button>
        <button
          type="button"
          onClick={() => {
            setZoom(zoom === 'fit' ? 1 : 'fit')
          }}
          title={zoom === 'fit' ? t('stage.zoomActual') : t('stage.zoomFit')}
          className="type-caption min-w-16 rounded-control px-2 py-1 text-ink-soft tabular-nums
            transition-colors duration-fast hover:bg-[var(--accent-soft)] hover:text-ink"
        >
          {zoom === 'fit' ? t('stage.zoomFit') : `${Math.round(zoom * 100)}%`}
        </button>
        <Button
          size="sm"
          variant="ghost"
          title={t('stage.zoomIn')}
          aria-label={t('stage.zoomIn')}
          onClick={() => {
            zoomBy(0.25)
          }}
        >
          +
        </Button>
      </div>
    </div>
  )
}
