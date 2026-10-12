import type { LogoResult } from '@sigilgen/types'

/**
 * Copies text to the clipboard.
 *
 * The async Clipboard API needs a secure context, which a local dev server on plain HTTP is not, so
 * there is a `execCommand` fallback. It is deprecated but remains the only thing that works in that
 * case, and losing the copy silently would be worse than using it.
 *
 * @param text - Text to place on the clipboard.
 * @returns `true` when the text reached the clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path below.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  } catch {
    return false
  }
}

/**
 * Offers a file to the user as a download.
 *
 * @param filename - Suggested file name.
 * @param blob - File contents.
 */
export function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking immediately would race the download in some browsers; a turn of the event loop is enough.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

/**
 * A file stem safe on every platform, derived from the brand name.
 *
 * Diacritics are folded rather than dropped. Stripping every non-ASCII character turned "Café Über" into
 * `caf-ber`, which is not a slug of the name a reader typed — the accent and the letter it was on both
 * vanish, and two different names can collapse to the same file. Normalising to ASCII first keeps the
 * letters and loses only the marks.
 *
 * @param name - The brand name as entered.
 * @returns A lowercase, hyphen-separated stem, or `logo` when nothing usable remains.
 */
export function fileStem(name: string): string {
  const slug = name
    .normalize('NFKD')
    // Combining marks are what `NFKD` splits the diacritics into, so removing them leaves the base letter.
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'logo' : slug
}

/** Triggers a download of a concept's SVG. */
export function downloadSvg(concept: LogoResult, stem: string): void {
  download(`${stem}.svg`, new Blob([concept.svg], { type: 'image/svg+xml' }))
}
