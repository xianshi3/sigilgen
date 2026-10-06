/**
 * Core type contracts for Sigilgen.
 *
 * Every module in `src/` speaks these types. They are intentionally small and JSON-shaped so the
 * curated brain files in `src/brain/` can be validated against them at load time.
 */

import type { SeedResolver } from './seed-resolver'

/** Identifier of one of the five rendering engines. */
export type EngineName = 'monogram' | 'wordmark' | 'lettermark' | 'abstract' | 'emblem'

/** Every engine, in the canonical order used for iteration and documentation. */
export const ENGINE_NAMES: readonly EngineName[] = [
  'monogram',
  'wordmark',
  'lettermark',
  'abstract',
  'emblem',
]

/** Visual tone of a typeface family. */
export type FontCategory = 'geometric-sans' | 'humanist-sans' | 'serif' | 'display'

/** A single colour pairing plus the metadata used to match it against keywords. */
export interface PaletteEntry {
  /** Stable kebab-case identifier, referenced by mood rules. */
  id: string
  /** Dominant brand colour. */
  primary: string
  /** Structural / secondary colour. */
  secondary: string
  /** Small-area accent colour. */
  accent: string
  /** Optional fourth colour for two-tone marks. */
  highlight?: string
  /** Canvas colour, or `null` for a transparent background. */
  background: string | null
  /** Free-form matching tags used by the palette resolver. */
  tags: string[]
}

/** Vertical metrics and per-glyph advance widths, in font units (1000 units per em). */
export interface FontMetrics {
  /** Height of a capital letter, measured from the baseline. */
  capHeight: number
  /** Height of a lowercase letter, measured from the baseline. */
  xHeight: number
  /** Highest point used by any glyph in the family. */
  ascender: number
  /** Lowest point used by any glyph in the family (positive, below the baseline). */
  descender: number
  /** Advance width per glyph, keyed by the uppercase letter. */
  advance: Record<string, number>
}

/**
 * A typeface with pre-generated glyph outlines.
 *
 * Glyph outlines are emitted as absolute-only SVG path data in a y-up coordinate space whose
 * origin is the left edge of the glyph on the baseline. They are produced at build time by
 * `scripts/build-brain.mjs` and shipped as JSON; no font file is ever parsed at runtime.
 */
export interface FontEntry {
  /** Stable kebab-case identifier, referenced by mood rules. */
  id: string
  /** Human-readable family name. */
  family: string
  /** Tone of the typeface. */
  category: FontCategory
  /** Nominal weight on the standard 100–900 scale. */
  weight: number
  /** Extra tracking, in font units, applied between glyphs. */
  letterSpacing: number
  /** Uppercase letter to SVG path data. */
  glyphs: Record<string, string>
  /** Vertical metrics and advance widths. */
  metrics: FontMetrics
  /** Free-form matching tags used by the font resolver. */
  tags: string[]
}

/** A pictogram drawn on a normalised grid. */
export interface IconEntry {
  /** Stable kebab-case key, referenced by mood rules. */
  key: string
  /** SVG path data in absolute commands, authored on the `viewBox` grid. */
  path: string
  /** The grid the path was authored on, e.g. `"0 0 24 24"`. */
  viewBox: string
  /** Grouping used by the icon resolver, e.g. `"nature"`. */
  category: string
  /** Free-form matching tags used by the icon resolver. */
  tags: string[]
}

/** A rule that maps keywords to a coherent set of resources and engine weights. */
export interface MoodRule {
  /** Stable kebab-case identifier. */
  id: string
  /** Keywords that vote for this mood. Substring matching, both directions. */
  keywords: string[]
  /** Palette ids this mood prefers. */
  paletteIds: string[]
  /** Font ids this mood prefers. */
  fontIds: string[]
  /** Icon keys this mood prefers. */
  iconKeys: string[]
  /** Relative likelihood of each engine when the user did not force one. */
  engineWeights: Record<string, number>
}

/** The complete curated knowledge base. */
export interface Brain {
  palettes: PaletteEntry[]
  fonts: FontEntry[]
  icons: IconEntry[]
  moods: MoodRule[]
}

/**
 * A design decision an engine would otherwise make from the seed.
 *
 * Each engine draws one of these from its candidate list, which is what makes a reroll produce
 * genuinely different compositions. Naming them lets a caller hold one still while the others vary.
 */
export type DesignDimension =
  /** Monogram container shape. */
  | 'container'
  /** Monogram and wordmark arrangement. */
  | 'layout'
  /** Wordmark lockup treatment. */
  | 'treatment'
  /** Lettermark accent element. */
  | 'accent'
  /** Emblem frame shape. */
  | 'frame'
  /** Abstract composition mode. */
  | 'mode'

/** Design decisions held fixed across every concept, keyed by dimension. */
export type DesignPreferences = Partial<Record<DesignDimension, string>>

/** User-facing configuration. */
export interface LogoConfig {
  /** Brand name. Required. Case is normalised; surrounding whitespace is trimmed. */
  name: string
  /** Comma or space separated keywords, e.g. `"tech, minimal"`. */
  keywords?: string
  /** Free-text brief; keywords are extracted from it too. */
  brief?: string
  /** Force a specific engine instead of letting the router choose. */
  engine?: EngineName
  /** Force a palette: a palette id, or a comma separated colour list. */
  palette?: string
  /** Force a font id. */
  font?: string
  /** Force an icon key. */
  icon?: string
  /** Numeric seed mixed into the hash. Defaults to `0`. */
  seed?: number
  /** Square canvas size in user units. Defaults to `512`. */
  size?: number
  /** Number of concepts to generate, 1–6. Defaults to `3`. */
  variations?: number
  /** Emit an opaque background rectangle. Defaults to `false`. */
  background?: boolean
  /**
   * Holds individual design decisions still instead of letting the seed choose them.
   *
   * Every dimension is optional and an absent one behaves exactly as before, so a configuration
   * without preferences produces byte-identical output to one that predates the field. Values are
   * validated against the engine's own candidate list; an unrecognised value is ignored rather than
   * rejected, because a preference is a hint and must never be able to fail a render.
   */
  preferences?: DesignPreferences
}

/** A configuration after validation, clamping and normalisation. */
export interface ResolvedRequest {
  /** Trimmed brand name as provided. */
  name: string
  /** Uppercase, whitespace-free letter sequence derived from `name`. */
  letters: string
  /** Lowercase words taken from the brand name alone. */
  nameWords: string[]
  /** Lowercase alphanumeric words extracted from `name`, `keywords` and `brief`. */
  words: string[]
  /** Normalised keyword string. */
  keywords: string
  /** Normalised brief string. */
  brief: string
  /** Forced engine, or `null` to let the router decide. */
  engine: EngineName | null
  /** Forced palette id, forced colour list, or `null`. */
  palette: string | null
  /** Forced font id, or `null`. */
  font: string | null
  /** Forced icon key, or `null`. */
  icon: string | null
  /** Seed mixed into the hash. */
  seed: number
  /** Square canvas size in user units. */
  size: number
  /** Number of concepts to generate. */
  variations: number
  /** Whether to emit a background rectangle. */
  background: boolean
  /** Design decisions held fixed. Empty when the caller expressed none. */
  preferences: DesignPreferences
}

/** The outcome of keyword matching. */
export interface MoodMatch {
  /** The winning rule. Falls back to `src/brain/moods.json`'s `neutral` rule on no match. */
  mood: MoodRule
  /** Every rule that scored at least one hit, ordered by score then id. */
  candidates: MoodRule[]
  /** Match score per candidate id. */
  scores: Record<string, number>
  /** Normalised words that were considered. */
  words: string[]
  /** Human-readable reasons for the chosen mood, used as concept notes. */
  notes: string[]
}

/**
 * A node in the emitted SVG tree.
 *
 * Only `tag`, `attrs` and `children` are needed; there is no styling object, because flat SVG
 * forbids gradients and filters.
 */
export interface SVGElement {
  /** Element name, e.g. `"path"`, `"rect"`, `"g"`, `"circle"`, `"polygon"`. */
  tag: string
  /** Attributes in insertion order. Insertion order is what makes output byte-stable. */
  attrs: Record<string, string | number>
  /** Optional child elements. */
  children?: SVGElement[]
}

/** Everything an engine needs in order to draw. */
export interface EngineInput {
  /** The validated request. */
  request: ResolvedRequest
  /** The resolved mood. */
  mood: MoodMatch
  /** The resolved palette. */
  palette: PaletteEntry
  /** The resolved font. */
  font: FontEntry
  /** The resolved icon, or `null` when the engine does not use one. */
  icon: IconEntry | null
  /** Which engine is drawing. */
  engine: EngineName
  /** Deterministic numeric stream for this concept. */
  seed: SeedResolver
  /** Concept index, `0`-based. */
  index: number
  /** Canvas size in user units. */
  size: number
  /** Letters to draw, uppercase and whitespace-free. */
  letters: string
}

/** An engine renders a concept as a flat list of SVG elements. */
export type Engine = (input: EngineInput) => SVGElement[]

/** A single generated logo concept. */
export interface LogoResult {
  /** The serialised SVG document. */
  svg: string
  /** The palette that was applied. */
  palette: PaletteEntry
  /** The font that was used. */
  font: FontEntry
  /** The icon that was used, or `null`. */
  icon: IconEntry | null
  /** Which engine drew it. */
  engine: EngineName
  /** Short rationale lines explaining the design decisions. */
  conceptNotes: string[]
  /**
   * Seed fingerprint for this concept, as the first 12 hex characters of its hash.
   *
   * Useful for reproducing a single concept out of a multi-concept run; it is derived from the
   * request and the concept index, so it is stable across machines.
   */
  seed: string
}

/** A single generated logo concept. */
export interface GenerateOptions extends LogoConfig {
  /** Alias of `seed`, kept for callers that prefer the explicit name. */
  randomSeed?: number
}

/** Options for {@link generateLogo}. */
export type GenerateLogoOptions = GenerateOptions
