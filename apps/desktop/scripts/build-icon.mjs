/**
 * Rasterises the desktop app icon from the checked-in SVG.
 *
 * The source is the exact output of the MCP server's `generate_logo` tool (see `icon-source.md` for
 * the call), selected from a set of candidates after checking it at 128, 64 and 32 px. Keeping the SVG
 * rather than re-generating it means the brand mark is a reviewed asset, and this script only decides
 * how it becomes a platform icon.
 *
 * The square is rounded here rather than left to the operating system: Windows and Linux show the PNG
 * as drawn, and macOS does not mask third-party icons either.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const buildDir = fileURLToPath(new URL('../build/', import.meta.url))

/** Side length of the master artwork. */
const SIZE = 1024

/** Corner radius of the tile, matching macOS's 22.37% app-icon mask. */
const RADIUS = Math.round(SIZE * 0.2237)

const source = await readFile(new URL('../build/icon-source.svg', import.meta.url), 'utf8')
const square = await sharp(Buffer.from(source)).resize(SIZE, SIZE).png().toBuffer()
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
