import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DesignDimension } from '@sigilgen/types'
import type { StudioConfig } from '../lib/generate'

/** How the stage is backed, so a mark can be judged against light and dark grounds. */
export type Backdrop = 'light' | 'dark' | 'board'

/**
 * What the option controls show as selected.
 *
 * The generator's contract is absence — an unpinned dimension is simply not in `preferences` — but a
 * control needs something to mark as chosen, so `'random'` is the value the reader selects to clear a
 * pin. The store turns it back into absence rather than storing it.
 */
export type PinnedValue = 'random' | string

/** Light, dark, or whatever the system says. */
export type ThemePreference = 'light' | 'dark' | 'auto'

/** Either scale to the available space, or a fixed multiple of the generated pixel size. */
export type Zoom = 'fit' | number

/** Range the zoom buttons step through. */
const ZOOM_MIN = 0.25
const ZOOM_MAX = 4

export interface StudioState extends StudioConfig {
  activeConcept: number
  backdrop: Backdrop
  theme: ThemePreference
  zoom: Zoom
  leftPanelOpen: boolean
  rightPanelOpen: boolean

  setField: <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) => void
  setActiveConcept: (index: number) => void
  setBackdrop: (backdrop: Backdrop) => void
  setTheme: (theme: ThemePreference) => void
  setZoom: (zoom: Zoom) => void
  zoomBy: (delta: number) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  /** Pins a dimension, or releases it back to the seed. */
  setPreference: (dimension: DesignDimension, value: PinnedValue) => void
  reroll: () => void
}

/**
 * Starting point.
 *
 * The brief is pre-filled with keywords rather than the name so that a first-time visitor sees a real
 * logo within a second of loading, instead of an empty stage they have to guess at.
 */
const INITIAL: StudioConfig = {
  name: 'Acme',
  keywords: 'tech, minimal',
  brief: '',
  engine: 'auto',
  // Empty rather than a named id: the whole point of the mood rules is that they pick well, and a
  // reader who has expressed nothing should see that rather than the studio's taste.
  palette: '',
  font: '',
  icon: '',
  size: 512,
  variations: 3,
  background: false,
  seed: 0,
  // Nothing pinned to begin with, so the first thing a reader sees is the seeded variation the
  // generator is actually good at rather than a half-made decision.
  preferences: {},
}

/** Fields worth surviving a reload: the design itself, plus the two viewing preferences. */
type PersistedStudio = Pick<
  StudioState,
  | 'name'
  | 'keywords'
  | 'brief'
  | 'engine'
  | 'palette'
  | 'font'
  | 'icon'
  | 'size'
  | 'variations'
  | 'background'
  | 'seed'
  | 'theme'
  | 'backdrop'
  | 'preferences'
>

/**
 * What gets written to storage.
 *
 * Everything here is either the reader's work or their stated preference. Transient interface state —
 * which panel is open, which concept is selected, the zoom — is deliberately left out so the app always
 * opens the way it is meant to be used rather than the way it happened to be left.
 */
function persisted(state: StudioState): PersistedStudio {
  return {
    name: state.name,
    keywords: state.keywords,
    brief: state.brief,
    engine: state.engine,
    palette: state.palette,
    font: state.font,
    icon: state.icon,
    size: state.size,
    variations: state.variations,
    background: state.background,
    seed: state.seed,
    theme: state.theme,
    backdrop: state.backdrop,
    preferences: state.preferences,
  }
}

export const useStudio = create<StudioState>()(
  persist(
    set => ({
      ...INITIAL,

      activeConcept: 0,
      backdrop: 'light',
      theme: 'auto',
      zoom: 'fit',
      leftPanelOpen: true,
      rightPanelOpen: true,

      setField: (key, value) => set({ [key]: value } as Partial<StudioState>),

      setActiveConcept: index => set({ activeConcept: index }),

      setBackdrop: backdrop => set({ backdrop }),

      setTheme: theme => set({ theme }),

      setZoom: zoom => set({ zoom }),

      // Stepping away from "fit" starts from actual size, which is the only value a reader can reason
      // about; scaling the invisible fit result would produce steps that mean nothing.
      zoomBy: delta =>
        set(state => {
          const current = state.zoom === 'fit' ? 1 : state.zoom
          const next = Math.min(
            ZOOM_MAX,
            Math.max(ZOOM_MIN, Math.round((current + delta) * 100) / 100)
          )
          return { zoom: next }
        }),

      toggleLeftPanel: () => set(state => ({ leftPanelOpen: !state.leftPanelOpen })),

      toggleRightPanel: () => set(state => ({ rightPanelOpen: !state.rightPanelOpen })),

      // 'random' is dropped rather than stored, so the generator keeps seeing an absent preference and
      // a released dimension is indistinguishable from one that was never touched.
      setPreference: (dimension, value) =>
        set(state => {
          const next = { ...state.preferences }
          if (value === 'random') {
            delete next[dimension]
          } else {
            next[dimension] = value
          }
          return { preferences: next }
        }),

      // The seed is an input to the hash rather than a counter, so bumping it lands somewhere unrelated
      // each time: every press is a genuinely different set of concepts, never the same reshuffle.
      reroll: () =>
        set(state => ({
          seed: state.seed + 1,
          activeConcept: 0,
        })),
    }),
    {
      name: 'sigilgen.studio',
      partialize: persisted,
    }
  )
)
