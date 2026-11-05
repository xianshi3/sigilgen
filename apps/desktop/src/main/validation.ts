/**
 * The small pure checks that guard the IPC boundary.
 *
 * They live apart from `ipc.ts` so they can be tested without Electron's runtime: importing Electron in
 * a plain Node process yields a path string, not an application.
 */

/** Windows device names that cannot be used as a file stem. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * Reduces a suggested file name to a safe leaf name.
 *
 * The save dialog normally protects the reader from a bad name, but the value still crosses IPC and a
 * path separator in it could change what the dialog opens with. Stripping directories, characters
 * Windows forbids and trailing dots is cheap insurance.
 *
 * @param value - The renderer's suggested name.
 * @returns A safe `*.svg` name, or `null` when nothing usable remains.
 */
export function safeSvgName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const leaf = value.trim().split(/[\\/]/).pop() ?? ''
  const cleaned = leaf
    .replace(/[<>:"|?*\p{Cc}]/gu, '-')
    .replace(/[. ]+$/g, '')
    .trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    return null
  }
  const stem = cleaned.replace(/\.svg$/i, '')
  if (WINDOWS_RESERVED.test(stem)) {
    return `${stem}-logo.svg`
  }
  return `${stem}.svg`
}

/**
 * Whether a value is a URL the shell is allowed to open.
 *
 * @param value - Candidate URL.
 * @returns `true` for absolute http and https URLs.
 */
export function isExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
