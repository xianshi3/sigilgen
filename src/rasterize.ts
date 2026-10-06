/**
 * Optional PNG rasterisation.
 *
 * `sharp` is an optional dependency: when it is not installed, every SVG feature still works and this
 * module simply reports that PNG output is unavailable. It is imported dynamically rather than at the
 * top level so the library never pulls in a native module unless the caller actually asks for a PNG.
 */

import type { LogoResult } from './types'

/**
 * The shape of `sharp`'s default export.
 *
 * Declared structurally rather than with an `import('sharp')` type annotation because `sharp` is an
 * optional dependency: a static type-only import of an absent package would break typechecking for
 * everyone who skipped the PNG path.
 */
type SharpModule = (input: Buffer | string, options?: Record<string, unknown>) => SharpPipeline

/** The subset of `sharp`'s chainable pipeline that `rasterise` uses. */
interface SharpPipeline {
  flatten(options: { background: string }): SharpPipeline
  resize(width: number, height: number, options: Record<string, unknown>): SharpPipeline
  png(options: Record<string, unknown>): SharpPipeline
  toBuffer(options: {
    resolveWithObject: true
  }): Promise<{ data: Buffer; info: { width: number; height: number } }>
}

/** Options for {@link rasterise}. */
export interface RasteriseOptions {
  /** Target square size in pixels. Defaults to the SVG's own size. */
  size?: number
  /** Background colour for the raster. Defaults to transparent. */
  background?: string
}

/** A rasterised PNG. */
export interface RasterResult {
  /** Raw PNG bytes. */
  data: Uint8Array
  /** Output size in pixels. */
  size: number
}

/** Thrown when PNG output was requested but `sharp` is not installed. */
export class RasterSupportError extends Error {
  /**
   * @param message - Human-readable explanation.
   */
  constructor(message: string) {
    super(message)
    this.name = 'RasterSupportError'
  }
}

/**
 * Reports whether PNG rasterisation is available in this installation.
 *
 * @returns `true` when `sharp` can be loaded.
 */
export async function hasRasterSupport(): Promise<boolean> {
  try {
    await import('sharp')
    return true
  } catch {
    return false
  }
}

/**
 * Rasterises a generated logo to PNG.
 *
 * @param result - A logo concept, or a bare SVG string.
 * @param options - Output size and background colour.
 * @returns The PNG bytes and their size.
 * @throws {RasterSupportError} When `sharp` is not installed.
 */
export async function rasterise(
  result: LogoResult | string,
  options: RasteriseOptions = {}
): Promise<RasterResult> {
  const svg = typeof result === 'string' ? result : result.svg

  let sharp: SharpModule
  try {
    sharp = (await import('sharp')).default as unknown as SharpModule
  } catch {
    throw new RasterSupportError(
      'PNG output requires the optional dependency "sharp". Install it with `npm install sharp` or `pnpm add sharp`; SVG output works without it.'
    )
  }

  const density = options.size ?? 512
  const pipeline = sharp(Buffer.from(svg, 'utf8'), { density: 144 })

  const flattened =
    options.background === undefined
      ? pipeline
      : pipeline.flatten({ background: options.background })

  const { data, info } = await flattened
    .resize(density, density, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer({ resolveWithObject: true })

  return { data: new Uint8Array(data), size: info.width }
}
