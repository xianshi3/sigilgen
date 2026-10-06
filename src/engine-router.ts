/**
 * Chooses which of the five engines draws a concept.
 *
 * Routing combines three inputs: the mood's declared engine weights, structural facts about the name
 * (how many letters, how many words), and any engine the caller forced.
 *
 * ## Engine selection rules
 *
 * | Engine | Selected when | Output |
 * | ------ | -------------- | ------ |
 * | `monogram` | name has ≤ 3 letters, or the mood favours it heavily | initials inside a geometric container |
 * | `wordmark` | name has 4–14 letters | icon plus brand name, horizontal or stacked |
 * | `lettermark` | minimal or abbreviation brands | letters only, no icon |
 * | `abstract` | abstract or generative concepts | seed-driven pure geometry, no text |
 * | `emblem` | badge, manufacturing or hospitality concepts | icon inside a frame with the name below |
 */

import { abstract } from './engines/abstract'
import { emblem } from './engines/emblem'
import { lettermark } from './engines/lettermark'
import { monogram } from './engines/monogram'
import { wordmark } from './engines/wordmark'
import type { SeedResolver } from './seed-resolver'
import {
  ENGINE_NAMES,
  type Engine,
  type EngineName,
  type MoodMatch,
  type ResolvedRequest,
} from './types'

/**
 * The engine implementations, keyed by id.
 *
 * The router imports the engines; engines never import the router. That direction is what keeps the
 * dependency graph acyclic and lets each engine be tested in isolation.
 */
export const ENGINES: Readonly<Record<EngineName, Engine>> = Object.freeze({
  monogram,
  wordmark,
  lettermark,
  abstract,
  emblem,
})

/** Name length at or below which a monogram is the right default. */
const MONOGRAM_MAX = 3

/** Name length beyond which a wordmark becomes hard to read at small sizes. */
const WORDMARK_MAX = 12

/**
 * Engine weights after structural adjustments, exposed for tests and for concept notes.
 *
 * @param request - The validated request.
 * @param mood - The resolved mood.
 * @returns A weight per engine, keyed by engine id.
 */
export function engineWeights(
  request: ResolvedRequest,
  mood: MoodMatch
): Record<EngineName, number> {
  /** @type {Record<EngineName, number>} */
  const weights = {
    monogram: 0,
    wordmark: 0,
    lettermark: 0,
    abstract: 0,
    emblem: 0,
  }

  for (const engine of ENGINE_NAMES) {
    weights[engine] = mood.mood.engineWeights[engine] ?? 0
  }

  const nameLength = request.letters.length
  const wordCount = Math.max(1, request.words.length)

  if (nameLength <= MONOGRAM_MAX) {
    // A two- or three-letter name has no room for a readable wordmark, and a mark that ignores the
    // name entirely is worse than one that does not.
    weights.monogram += 4
    weights.lettermark += 1.5
    weights.wordmark = Math.max(0, weights.wordmark - 1)
    weights.abstract = Math.max(0, weights.abstract - 1)
    weights.emblem = Math.max(0, weights.emblem - 0.5)
  } else if (nameLength <= WORDMARK_MAX) {
    weights.wordmark += 1.5
  } else {
    // Very long names favour a lettermark or an abstract mark over an unreadable wordmark.
    weights.wordmark = Math.max(0, weights.wordmark - 1)
    weights.lettermark += 2
    weights.abstract += 0.5
  }

  if (wordCount > 1 && nameLength > MONOGRAM_MAX) {
    // Multi-word names read badly as a single lockup.
    weights.monogram += 1
    weights.emblem += 0.5
    weights.abstract += 0.5
  }

  return weights
}

/**
 * Routes a request to an engine.
 *
 * @param request - The validated request.
 * @param mood - The resolved mood.
 * @param seed - The deterministic stream for this concept.
 * @returns The engine id to use.
 */
export function route(request: ResolvedRequest, mood: MoodMatch, seed: SeedResolver): EngineName {
  if (request.engine !== null) {
    return request.engine
  }
  const weights = engineWeights(request, mood)
  return seed.weighted(ENGINE_NAMES.map(engine => ({ value: engine, weight: weights[engine] })))
}

/**
 * Explains the routing decision in one line.
 *
 * @param request - The validated request.
 * @param mood - The resolved mood.
 * @param engine - The engine that was chosen.
 * @returns A short rationale.
 */
export function explainRoute(
  request: ResolvedRequest,
  mood: MoodMatch,
  engine: EngineName
): string {
  if (request.engine !== null) {
    return `Engine "${engine}" was requested explicitly.`
  }
  const nameLength = request.letters.length
  let structure = `${nameLength}-letter name is too long for a wordmark alone`
  if (nameLength <= MONOGRAM_MAX) {
    structure = `${nameLength}-letter name favours a monogram`
  } else if (nameLength <= WORDMARK_MAX) {
    structure = `${nameLength}-letter name favours a wordmark`
  }
  const declared = mood.mood.engineWeights[engine] ?? 0
  return `Engine "${engine}": ${structure}; mood "${mood.mood.id}" weights it ${declared}.`
}
