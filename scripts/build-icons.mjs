/**
 * Rebuilds the path data in `src/brain/icons.json` from Material Design Icons.
 *
 * The keys, categories and tags are Sigilgen's curation; only the geometry is vendored. Keeping the
 * mapping here rather than in the JSON means the source, version and licence are reviewable in one
 * place, and `--check` can prove the committed data matches the pinned package.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import * as mdi from '@mdi/js'

/** Sigilgen icon key → Material Design Icons export. */
const MAPPING = {
  'mountain-peak': 'mdiImageFilterHdr',
  'pine-tree': 'mdiPineTree',
  leaf: 'mdiLeaf',
  wave: 'mdiWaves',
  sun: 'mdiWeatherSunny',
  moon: 'mdiMoonWaningCrescent',
  droplet: 'mdiWater',
  cloud: 'mdiCloud',
  sprout: 'mdiSprout',
  feather: 'mdiFeather',
  snowflake: 'mdiSnowflake',
  'circuit-node': 'mdiChip',
  'terminal-window': 'mdiConsole',
  database: 'mdiDatabase',
  'cloud-server': 'mdiServerNetwork',
  'network-nodes': 'mdiLan',
  'shield-lock': 'mdiShieldLock',
  'cpu-chip': 'mdiCpu64Bit',
  satellite: 'mdiSatelliteVariant',
  'gear-cog': 'mdiCog',
  'coffee-cup': 'mdiCoffee',
  'leaf-tea': 'mdiTea',
  wheat: 'mdiBarley',
  'bread-loaf': 'mdiBreadSlice',
  'apple-fruit': 'mdiFoodApple',
  'flame-kitchen': 'mdiFire',
  'hexagon-beer': 'mdiBeer',
  'coin-stack': 'mdiCashMultiple',
  'bank-columns': 'mdiBank',
  'chart-up': 'mdiChartLine',
  wallet: 'mdiWallet',
  'diamond-gem': 'mdiDiamondStone',
  receipt: 'mdiReceiptText',
  rocket: 'mdiRocket',
  'ship-wheel': 'mdiShipWheel',
  'hot-air-balloon': 'mdiAirballoon',
  anchor: 'mdiAnchor',
  'road-arrow': 'mdiRoadVariant',
  'truck-box': 'mdiTruck',
  'heart-pulse': 'mdiHeartPulse',
  'pill-cross': 'mdiPill',
  tooth: 'mdiTooth',
  'leaf-herb': 'mdiClover',
  'bandage-cross': 'mdiBandage',
  'play-triangle': 'mdiPlay',
  'music-note': 'mdiMusicNote',
  'camera-lens': 'mdiCameraIris',
  'film-strip': 'mdiFilmstrip',
  headphones: 'mdiHeadphones',
  hammer: 'mdiHammer',
  wrench: 'mdiWrench',
  'hard-hat': 'mdiHardHat',
  'blueprint-draft': 'mdiDrawing',
  'compass-draft': 'mdiMathCompass',
  trophy: 'mdiTrophy',
  'target-bullseye': 'mdiTarget',
  dumbbell: 'mdiDumbbell',
  'mountain-flag': 'mdiFlagVariant',
  'asterisk-spark': 'mdiAsterisk',
  'spiral-vortex': 'mdiRotate360',
  'cube-iso': 'mdiCube',
  'hexagon-node': 'mdiHexagonMultiple',
  'infinity-loop': 'mdiInfinity',
  'plus-cross': 'mdiPlus',
  'diamond-shape': 'mdiDiamond',
  'chevron-double': 'mdiChevronDoubleRight',
  'star-burst': 'mdiStarFourPoints',
  'ring-orbit': 'mdiOrbit',
  'brackets-code': 'mdiCodeTags',
  'link-chain': 'mdiLinkVariant',
}

const file = 'src/brain/icons.json'
const original = readFileSync(file, 'utf8')
const data = JSON.parse(original)
const { icons } = data
const keys = new Set(icons.map(icon => icon.key))
// A plain lookup keeps the namespace access static for the linter; the mapping is data, not an import
// form, so the generated package is still fully tree-shaken by the build.
const PATHS = { ...mdi }

for (const key of Object.keys(MAPPING)) {
  if (!keys.has(key)) {
    throw new Error(`mapping has an icon that the brain does not: ${key}`)
  }
}
for (const key of keys) {
  if (!(key in MAPPING)) {
    throw new Error(`brain icon has no MDI mapping: ${key}`)
  }
}

let text = original
const changed = []
for (const icon of icons) {
  const exportName = MAPPING[icon.key]
  const path = PATHS[exportName]
  if (typeof path !== 'string') {
    throw new Error(`unknown Material Design Icons export: ${exportName}`)
  }
  const needle = `"key": "${icon.key}",`
  const start = text.indexOf(needle)
  if (start === -1) {
    throw new Error(`could not find ${icon.key} in icons.json`)
  }
  const marker = '"path": "'
  const pathStart = text.indexOf(marker, start)
  const valueStart = pathStart + marker.length
  const valueEnd = text.indexOf('"', valueStart)
  const previous = text.slice(valueStart, valueEnd)
  if (previous !== path) {
    changed.push(icon.key)
    text = `${text.slice(0, valueStart)}${path}${text.slice(valueEnd)}`
  }
}

if (process.argv.includes('--check')) {
  if (changed.length > 0) {
    console.error(`icons.json is stale for: ${changed.join(', ')}`)
    console.error('Run `pnpm run build:icons` to regenerate it.')
    process.exitCode = 1
  } else {
    console.log(`icons.json is in sync (${icons.length} icons from @mdi/js)`)
  }
} else {
  writeFileSync(file, text)
  console.log(
    changed.length === 0
      ? `icons.json is already in sync (${icons.length} icons)`
      : `wrote ${changed.length} icon paths (${icons.length} icons)`
  )
}
