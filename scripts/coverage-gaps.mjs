// Developer helper: lists uncovered statement lines per source file from the last coverage run.
// Not part of the CI gate; `pnpm run check` does not invoke it.
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'))

for (const [file, data] of Object.entries(report).toSorted(([a], [b]) => a.localeCompare(b))) {
  const uncovered = Object.entries(data.statementMap)
    .filter(([id]) => data.s[id] === 0)
    .map(([, loc]) => loc.start.line)
    .toSorted((a, b) => a - b)
  if (uncovered.length === 0) {
    continue
  }
  const relative = file.replaceAll('\\', '/').split('/src/')[1] ?? file
  // Collapse consecutive runs so the output reads as regions, not a wall of numbers.
  const regions = []
  for (const line of uncovered) {
    const last = regions.at(-1)
    if (last !== undefined && line === last[1] + 1) {
      last[1] = line
    } else {
      regions.push([line, line])
    }
  }
  console.log(
    `${relative.padEnd(24)} ${regions.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ')}`
  )
}
