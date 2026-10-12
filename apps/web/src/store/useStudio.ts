import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DesignDimension } from '@sigilgen/types'
import type { StudioConfig } from '../lib/generate'
import { emptyEdit, type PartEdit } from '../lib/svgParts'

/** How the stage is backed, so a mark can be judged against light and dark grounds. */
export type Backdrop = 'light' | 'dark' | 'board'

/**
 * Edits to one concept's parts, keyed by the concept's seed fingerprint.
 *
 * The seed is the key rather than the concept's index because the index is positional and shifts when
 * the variation count changes, while the fingerprint identifies the same mark wherever it appears. An
 * absent key means the concept is untouched, so an unedited concept exports byte-identically to the
 * generator.
 */
export type ConceptEdits = Record<string, PartEdit[]>

/**
 * One step of the edit history: the complete edits map as it was before a gesture.
 *
 * The whole map is stored rather than a single part's delta, because a gesture can touch any part and
 * because undo has to restore the map as it was. Storing the map makes undo a swap.
 *
 * Deliberately not the selection: which part is highlighted is not an edit, and undoing one should not
 * move the reader's attention anywhere.
 */
interface HistoryEntry {
  edits: ConceptEdits
}

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

  /**
   * Whether the stage is in edit mode.
   *
   * Off by default, because the stage's job is to show the mark the generator made and anything that
   * makes it look editable undermines that. Turning it on is a deliberate act, and it is what makes the
   * paths selectable and draggable.
   */
  editMode: boolean
  edits: ConceptEdits
  selectedPart: number | null
  past: HistoryEntry[]
  future: HistoryEntry[]

  setField: <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) => void
  setActiveConcept: (index: number) => void
  setBackdrop: (backdrop: Backdrop) => void
  setTheme: (theme: ThemePreference) => void
  setZoom: (zoom: Zoom) => void
  zoomBy: (delta: number) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  /**
   * Sets a panel's open state outright.
   *
   * Toggling alone is not enough: a narrow viewport has to close *both* panels at once when the layout
   * changes, and a toggle cannot express "close" for a panel that might already be closed.
   */
  setLeftPanelOpen: (open: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  /** Pins a dimension, or releases it back to the seed. */
  setPreference: (dimension: DesignDimension, value: PinnedValue) => void
  reroll: () => void

  setEditMode: (on: boolean) => void
  selectPart: (index: number | null) => void
  /**
   * Snapshots the current edits so the next change can be undone.
   *
   * Called once at the start of a gesture — a pointer-down on the stage, a pointer-down on a slider, a
   * button press — and never per pointer-move. A drag sends dozens of patches, and recording each one
   * would make undo step back a pixel at a time.
   */
  beginEdit: () => void
  /**
   * Applies a patch to one part of one concept.
   *
   * The patch is merged into the existing edit rather than replacing it, so a drag can send many small
   * patches without each one discarding the last. Does not touch history; see {@link beginEdit}.
   */
  updatePart: (conceptSeed: string, index: number, patch: Partial<PartEdit>) => void
  undo: () => void
  redo: () => void
  /** Discards every edit to one concept, returning it to the generator's output. */
  resetEdits: (conceptSeed: string) => void
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
  | 'edits'
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
    // The reader's edits are their work, so they survive a reload like the design does. The undo
    // history is deliberately left out: it is transient, and restoring it would put the app back mid-gesture.
    edits: state.edits,
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

      editMode: false,
      edits: {},
      selectedPart: null,
      past: [],
      future: [],

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

      setLeftPanelOpen: leftPanelOpen => set({ leftPanelOpen }),

      setRightPanelOpen: rightPanelOpen => set({ rightPanelOpen }),

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

      // --- Part editing -------------------------------------------------------------------------
      //
      // Edits are keyed by the concept's seed fingerprint and stored as one entry per part, so an
      // unedited concept has no entry at all and exports byte-identically to the generator.

      setEditMode: on =>
        set(state => ({
          editMode: on,
          // Leaving edit mode drops the selection, because a highlight on a part that can no longer be
          // edited reads as a promise the interface is not keeping.
          selectedPart: on ? state.selectedPart : null,
        })),

      selectPart: index => set({ selectedPart: index }),

      beginEdit: () =>
        set(state => ({
          past: [...state.past, { edits: state.edits }],
          // Any new gesture invalidates the redo branch: the reader has gone somewhere the stored
          // future no longer describes.
          future: [],
        })),

      updatePart: (conceptSeed, index, patch) =>
        set(state => {
          const conceptEdits = state.edits[conceptSeed] ?? []
          const current = conceptEdits[index] ?? emptyEdit()
          const next = { ...current, ...patch }
          const updated = [...conceptEdits]
          updated[index] = next
          return { edits: { ...state.edits, [conceptSeed]: updated } }
        }),

      undo: () =>
        set(state => {
          const previous = state.past.at(-1)
          if (previous === undefined) {
            return state
          }
          return {
            edits: previous.edits,
            past: state.past.slice(0, -1),
            future: [...state.future, { edits: state.edits }],
          }
        }),

      redo: () =>
        set(state => {
          const next = state.future.at(-1)
          if (next === undefined) {
            return state
          }
          return {
            edits: next.edits,
            future: state.future.slice(0, -1),
            past: [...state.past, { edits: state.edits }],
          }
        }),

      resetEdits: conceptSeed =>
        set(state => {
          const next = { ...state.edits }
          delete next[conceptSeed]
          return {
            edits: next,
            selectedPart: null,
            past: [...state.past, { edits: state.edits }],
            future: [],
          }
        }),
    }),
    {
      name: 'sigilgen.studio',
      partialize: persisted,
    }
  )
)
