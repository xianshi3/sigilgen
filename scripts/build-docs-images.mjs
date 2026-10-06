/**
 * Builds the README artwork.
 *
 * The images are generated from the generator rather than screenshotted, for two reasons. They stay
 * sharp at any zoom because they are vector, and they cannot drift from the code: rerun this after a
 * rendering change and the diff is the change. A screenshot would have needed re-taking by hand and
 * would have been a second, silently-stale copy of the truth.
 *
 * Output is committed, because a README that builds its own images on the reader's machine is a
 * README with no images.
 *
 * It imports the built bundle rather than `src/`, for the same reason `build-brain.mjs` reads JSON
 * instead of importing it: the sources are TypeScript with JSON imports, which plain node cannot load.
 * The npm script builds first.
 *
 * Usage: `pnpm run docs:images`
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { generateLogos } from '../dist/index.js'

const OUT = new URL('../docs/images/', import.meta.url)

/** Canvas the generator is asked for. The sheet scales it down; the marks do not care. */
const MARK = 512

/** One cell of the sheet, in sheet units. */
const CELL = 190

/** Gap between cells. */
const GUTTER = 14

/** Quiet grey for the paper and the rules, so the marks are the only saturated thing on the page. */
const PAPER = '#ffffff'
const EDGE = '#e6e8ec'
const LABEL = '#8b93a1'

/**
 * Nests one generated mark into a cell.
 *
 * The mark's own `<svg>` wrapper is unwrapped rather than reused: its `width` and `height` would
 * fight the cell's, and keeping its closing tag nests one document inside another, which is malformed
 * XML and renders as an error page rather than as a mark. What is left is a set of paths already in the
 * generator's 0 0 512 512 space, so a plain translate-and-scale places them.
 *
 * @param {string} svg - A document from the generator.
 * @param {number} x - Cell left edge in sheet units.
 * @param {number} y - Cell top edge in sheet units.
 * @param {string} caption - Small grey label under the mark.
 * @returns {string} The cell as SVG markup.
 */
function cell(svg, x, y, caption) {
  const open = svg.indexOf('>')
  const close = svg.lastIndexOf('</svg>')
  if (open < 0 || close < open) {
    throw new Error(`cannot unwrap this document:\n${svg.slice(0, 120)}`)
  }
  const body = svg.slice(open + 1, close)
  const scale = (CELL - 32) / MARK
  return [
    `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="18" fill="${PAPER}" stroke="${EDGE}"/>`,
    `<g transform="translate(${x + 16} ${y + 16}) scale(${scale})">${body}</g>`,
    `<text x="${x + CELL / 2}" y="${y + CELL - 14}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="${LABEL}">${caption}</text>`,
  ].join('')
}

/**
 * Fails on unbalanced tags.
 *
 * The first version of this script nested a whole document inside another and wrote malformed XML that
 * GitHub would render as an error box in the README. Nothing in the pipeline noticed, because the
 * images are not part of the package build and no test reads them. Checking here is the only place it
 * can be caught.
 *
 * @param {string} svg - The document about to be written.
 * @returns {void}
 * @throws {Error} When a tag is closed that was never opened, or left open at the end.
 */
function assertBalanced(svg) {
  const stack = []
  const pattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g
  let match = pattern.exec(svg)
  while (match !== null) {
    const [, closing = '', name = '', , selfClosing = ''] = match
    if (closing === '/') {
      if (stack.pop() !== name) {
        throw new Error(`unbalanced </${name}> in the sheet`)
      }
    } else if (selfClosing !== '/') {
      stack.push(name)
    }
    match = pattern.exec(svg)
  }
  if (stack.length > 0) {
    throw new Error(`unclosed <${stack.join('>, <')}>`)
  }
}

/**
 * Writes one sheet, refusing to write it if the markup is not well formed.
 *
 * @param {string} name - File name inside the output directory.
 * @param {string} svg - The document.
 * @returns {void}
 */
function write(name, svg) {
  assertBalanced(svg)
  writeFileSync(new URL(name, OUT), svg)
  console.log(`wrote docs/images/${name} (${svg.length} bytes)`)
}

/**
 * Lays out a grid of generated marks.
 *
 * @param {object} spec
 * @param {string} spec.title - Headline above the grid.
 * @param {string} spec.subtitle - Smaller line under the headline.
 * @param {Array<{svg: string, caption: string}>} spec.marks - The marks to draw, in reading order.
 * @param {number} spec.columns - Cells per row.
 * @returns {string} A standalone SVG document.
 */
function sheet({ title, subtitle, marks, columns }) {
  const rows = Math.ceil(marks.length / columns)
  const width = columns * CELL + (columns + 1) * GUTTER
  const headerHeight = 78
  const height = headerHeight + rows * (CELL + GUTTER) + GUTTER
  const cells = marks
    .map((mark, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const x = GUTTER + column * (CELL + GUTTER)
      const y = headerHeight + row * (CELL + GUTTER)
      return cell(mark.svg, x, y, mark.caption)
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">
<rect width="${width}" height="${height}" fill="#f7f8fa"/>
<text x="${GUTTER + 4}" y="40" font-family="ui-sans-serif, system-ui, sans-serif" font-size="21" font-weight="600" fill="#14161a">${title}</text>
<text x="${GUTTER + 4}" y="62" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#5c6472">${subtitle}</text>
${cells}
</svg>
`
}

mkdirSync(OUT, { recursive: true })

// 1. The product shot: one call, six concepts. Nothing is curated by hand here — this is literally
//    what `generateLogos({ name: 'Northwind Coffee', keywords: 'coffee, artisan', variations: 6 })`
//    returns, which is the point the README is making.
const six = generateLogos({
  name: 'Northwind Coffee',
  keywords: 'coffee, artisan',
  variations: 6,
  size: MARK,
})
write(
  'concepts.svg',
  sheet({
    title: 'Six concepts from one call',
    subtitle:
      'generateLogos({ name: "Northwind Coffee", keywords: "coffee, artisan", variations: 6 }) — unedited output',
    columns: 6,
    marks: six.map((logo, index) => ({ svg: logo.svg, caption: `${index + 1}. ${logo.engine}` })),
  })
)

// 2. The range: the same short name through each engine, so the five readings are visible side by side.
const ENGINES = ['monogram', 'wordmark', 'lettermark', 'abstract', 'emblem']
const engines = ENGINES.map(engine => {
  const [logo] = generateLogos({ name: 'Vela', engine, variations: 1, size: MARK })
  return logo === undefined ? null : { svg: logo.svg, caption: engine }
}).filter(logo => logo !== null)
write(
  'engines.svg',
  sheet({
    title: 'Five engines, one name',
    subtitle: 'A different structural reading of the same input — not a recolouring',
    columns: 5,
    marks: engines,
  })
)
