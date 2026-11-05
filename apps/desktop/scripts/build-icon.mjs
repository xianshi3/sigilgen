/**
 * Draws the desktop app icon with Sigilgen itself.
 *
 * The icon is a build artefact, not a hand-drawn asset: running this script after a change to the
 * monogram engine redraws it from the same code the product ships. It needs the library's `dist/`
 * because Node cannot import the TypeScript source directly; run `pnpm build` at the repository root
 * first.
 *
 * The square is rounded here rather than left to the operating system: Windows and Linux show the PNG
 * as drawn, and macOS does not mask third-party icons either.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const buildDir = fileURLToPath(new URL('../build/', import.meta.url))

/** Side length of the master artwork. */
const SIZE = 1024

/** Corner radius of the tile, matching macOS's 22.37% app-icon mask. */
const RADIUS = Math.round(SIZE * 0.2237)

const { generateLogos } = await import(
  new URL('../../../dist/index.js', import.meta.url).href
).catch(() => {
  throw new Error('dist/index.js is missing. Run `pnpm build` at the repository root first.')
})

const [logo] = generateLogos({
  name: 'Sigilgen',
  engine: 'monogram',
  palette: '#171411,#F4EDDF,#C65A32',
  size: SIZE,
  variations: 1,
  background: true,
})

if (logo === undefined) {
  throw new Error('The generator produced no icon concept.')
}

const square = await sharp(Buffer.from(logo.svg)).resize(SIZE, SIZE).png().toBuffer()
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" fill="#fff"/></svg>`
)
const rounded = await sharp(square)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer()

await mkdir(buildDir, { recursive: true })
const pngPath = `${buildDir}icon.png`
const icoPath = `${buildDir}icon.ico`
await writeFile(pngPath, rounded)
await writeFile(icoPath, await pngToIco(pngPath))

console.log(`Wrote ${pngPath} and ${icoPath} (${rounded.length} bytes of PNG)`)
