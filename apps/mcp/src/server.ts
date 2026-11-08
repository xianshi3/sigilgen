/**
 * The Model Context Protocol surface for Sigilgen.
 *
 * The server is a thin adapter: it validates the arguments a client sends, calls the library, and
 * formats the result as MCP content. Every design decision still comes from the JSON brain, so a
 * client that asks twice with the same input gets the same bytes — the protocol layer adds nothing
 * that could drift.
 *
 * Two tools and five resources:
 *
 * - `generate_logo` — the whole generator, as one call.
 * - `list_options` — engine ids, palettes, fonts, pictograms and moods, for clients that do not read
 *   resources.
 * - `sigilgen://options/*` — the same catalogues as JSON resources, which is the idiomatic route for
 *   clients that do support them.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  ENGINE_NAMES,
  FONTS,
  ICONS,
  MOODS,
  PALETTES,
  RasterSupportError,
  SCENE_MAX_ELEMENTS,
  SCENE_MAX_POINTS,
  SCENE_MAX_SIZE,
  SCENE_MIN_SIZE,
  SceneError,
  generateLogos,
  normaliseScene,
  rasterise,
  renderScene,
  sceneFromLogo,
  type EngineName,
  type GenerateOptions,
  type LogoResult,
  type LogoScene,
} from 'sigilgen'

/** Name the server reports in the MCP handshake. */
export const SERVER_NAME = 'sigilgen'

/** Version the server reports in the MCP handshake. */
export const SERVER_VERSION = '0.2.0'

/** One-line gloss per engine, so a model can choose without guessing from the id. */
const ENGINE_HINTS: Record<EngineName, string> = {
  monogram: 'Initials inside a geometric container (circle, squircle, hexagon, shield, seal).',
  wordmark: 'The full brand name paired with a pictogram, horizontal or stacked.',
  lettermark: 'Letters only, no pictogram.',
  apparatus: 'Initials in a chamfered core framed by hairline arcs and ticks — technical signage.',
  abstract: 'Pure geometry, no type at all: orbits, lattices, waves, portals and ten more modes.',
  emblem: 'Pictogram and name inside one frame — badge, label, hospitality.',
  pictogram: 'The pictogram alone: on the page, sealed in a ring, or reversed out of a disc.',
  halftone: 'The initial screened as a field of dots sized by how deep the ink is.',
  scanline: 'The initial cut into horizontal bars — terminal, signal, developer.',
}

/** The catalogues a client can browse, keyed by the name both the tool and the resources use. */
type CatalogueKind = 'engines' | 'palettes' | 'fonts' | 'icons' | 'moods'

/** Fields every scene element accepts. */
const ELEMENT_COMMON = {
  id: z.string().optional().describe('Stable id for editing. Omit it and one is assigned.'),
  name: z.string().optional().describe('Layer name.'),
  hidden: z.boolean().optional().describe('Leave the element in the scene but do not draw it.'),
  translate: z.tuple([z.number(), z.number()]).optional().describe('Translation [x, y].'),
  rotate: z.number().optional().describe('Clockwise rotation in degrees about the element centre.'),
  scale: z.number().optional().describe('Uniform scale about the element centre.'),
  opacity: z.number().min(0).max(1).optional(),
  fill: z
    .string()
    .optional()
    .describe('Hex or named colour, a palette role, or "none". Defaults to primary.'),
  stroke: z.string().optional().describe('Hex or named colour, a palette role, or "none".'),
  strokeWidth: z.number().min(0).optional().describe('Stroke width in user units. Default 2.'),
  fillRule: z.enum(['nonzero', 'evenodd']).optional(),
}

/** One element in a scene document. */
const SCENE_ELEMENT_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    rx: z.number().min(0).optional(),
    ...ELEMENT_COMMON,
  }),
  z.object({
    type: z.literal('circle'),
    cx: z.number(),
    cy: z.number(),
    r: z.number().positive(),
    ...ELEMENT_COMMON,
  }),
  z.object({
    type: z.literal('ellipse'),
    cx: z.number(),
    cy: z.number(),
    rx: z.number().positive(),
    ry: z.number().positive(),
    ...ELEMENT_COMMON,
  }),
  z.object({
    type: z.literal('polygon'),
    points: z
      .array(z.tuple([z.number(), z.number()]))
      .min(3)
      .max(SCENE_MAX_POINTS),
    ...ELEMENT_COMMON,
  }),
  z.object({
    type: z.literal('star'),
    cx: z.number(),
    cy: z.number(),
    outer: z.number().positive(),
    inner: z.number().positive(),
    points: z.number().int().min(3).max(24),
    rotation: z.number().optional(),
    ...ELEMENT_COMMON,
  }),
  z.object({
    type: z.literal('ring'),
    cx: z.number(),
    cy: z.number(),
    rx: z.number().positive(),
    ry: z.number().positive(),
    weight: z.number().positive(),
    ...ELEMENT_COMMON,
  }),
  z.object({
    type: z.literal('path'),
    d: z.string().min(1).describe('Safe absolute path data using M/L/C/Z only.'),
    ...ELEMENT_COMMON,
  }),
  z.object({
    type: z.literal('text'),
    text: z.string().min(1).max(200).describe('Letters A–Z and spaces.'),
    font: z.string().optional().describe('Brain font id. Defaults to the scene font.'),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    tracking: z.number().min(-0.2).max(0.5).optional(),
    ...ELEMENT_COMMON,
  }),
  z.object({
    type: z.literal('icon'),
    key: z.string().min(1).describe('Brain pictogram key. See list_options icons.'),
    x: z.number(),
    y: z.number(),
    size: z.number().positive(),
    ...ELEMENT_COMMON,
  }),
])

/** A complete scene document. */
const SCENE_SCHEMA = z.object({
  version: z.literal(1).optional(),
  title: z.string().optional().describe('Document name, used for file names.'),
  size: z.number().int().min(SCENE_MIN_SIZE).max(SCENE_MAX_SIZE).optional(),
  palette: z.string().nullable().optional().describe('Palette id used to resolve colour roles.'),
  font: z.string().nullable().optional().describe('Default font id for text.'),
  background: z
    .string()
    .nullable()
    .optional()
    .describe('Colour, palette role, or null for transparency.'),
  elements: z
    .array(SCENE_ELEMENT_SCHEMA)
    .max(SCENE_MAX_ELEMENTS)
    .describe('Paint order: first is bottom.'),
})

/** The schema and a worked example, served as a resource so a model can read the grammar once. */
const SCENE_GUIDE = {
  summary:
    'A scene is a square canvas of flat shapes painted in order. Coordinates are user units with the origin at the top-left. Colours may be #rrggbb, a CSS colour name, or a palette role (primary, secondary, accent, highlight, background); roles need a palette id. Text is set from the brain’s outlines, not a system font.',
  canvas: {
    version: 1,
    size: `integer ${SCENE_MIN_SIZE}–${SCENE_MAX_SIZE}, default 512`,
    palette: 'palette id or null',
    font: 'default font id or null',
    background: 'colour, palette role, or null',
    elements: `ordered array, first at the bottom, maximum ${SCENE_MAX_ELEMENTS}`,
  },
  elementCommon: {
    id: 'optional stable id',
    name: 'optional layer name',
    hidden: 'optional boolean',
    translate: '[x, y]',
    rotate: 'degrees about the element centre',
    scale: 'uniform about the element centre',
    opacity: '0..1',
    fill: 'colour, role or none; default primary',
    stroke: 'colour, role or none',
    strokeWidth: 'user units, default 2',
    fillRule: 'nonzero or evenodd',
  },
  elementTypes: {
    rect: 'x, y, width, height, rx?',
    circle: 'cx, cy, r',
    ellipse: 'cx, cy, rx, ry',
    polygon: 'points: [x, y][] with 3..256 vertices',
    star: 'cx, cy, outer, inner, points 3..24, rotation?',
    ring: 'cx, cy, rx, ry, weight',
    path: 'd: safe M/L/C/Z path data',
    text: 'text, x, y, width, height, font?, tracking?',
    icon: 'key, x, y, size',
  },
  example: {
    version: 1,
    size: 512,
    palette: 'ink-monolith',
    font: 'inter-bold',
    background: null,
    elements: [
      { type: 'circle', cx: 256, cy: 232, r: 132, fill: 'primary' },
      { type: 'ring', cx: 256, cy: 232, rx: 106, ry: 106, weight: 10, fill: 'accent' },
      { type: 'text', text: 'NORTHWIND', x: 56, y: 392, width: 400, height: 52, fill: 'primary' },
    ],
  },
}

/** Header line for a rendered scene. */
function sceneHeader(scene: LogoScene, files: readonly string[]): string {
  const palette = scene.palette ?? 'literal colours'
  const suffix = files.length === 0 ? '' : ` · files: ${files.join(', ')}`
  return `Scene ${scene.size}×${scene.size} · ${scene.elements.length} elements · ${palette}${suffix}`
}

/** A text content block. */
interface TextBlock {
  type: 'text'
  text: string
}

/** An image content block. */
interface ImageBlock {
  type: 'image'
  data: string
  mimeType: 'image/png'
}

/** One image content block from PNG bytes. */
function imageBlock(data: Uint8Array): ImageBlock {
  return { type: 'image', data: Buffer.from(data).toString('base64'), mimeType: 'image/png' }
}

/**
 * Returns one catalogue as plain JSON.
 *
 * The brain is returned whole rather than summarised: the point of the resource is that a model can
 * read the same palette and pictogram ids the generator will accept, tags included, without a second
 * round trip for a detail the catalogue already holds.
 *
 * @param kind - Which catalogue to return.
 * @returns A JSON-serialisable document.
 */
function catalogue(kind: CatalogueKind): unknown {
  switch (kind) {
    case 'engines':
      return ENGINE_NAMES.map(id => ({ id, hint: ENGINE_HINTS[id] }))
    case 'palettes':
      return PALETTES
    case 'fonts':
      return FONTS.map(font => ({
        id: font.id,
        family: font.family,
        category: font.category,
        weight: font.weight,
        tags: font.tags,
      }))
    case 'icons':
      return ICONS
    case 'moods':
      return MOODS.map(mood => ({
        id: mood.id,
        keywords: mood.keywords,
        engineWeights: mood.engineWeights,
        paletteIds: mood.paletteIds,
        fontIds: mood.fontIds,
        iconKeys: mood.iconKeys,
      }))
  }
}

/**
 * A file-safe stem for a brand name.
 *
 * The CLI names its files the same way — lower-case ASCII, runs of anything else collapsed to one
 * hyphen — so a file written by an assistant and a file written by `sigilgen --output` agree.
 *
 * @param name - The brand name.
 * @returns The stem, never empty.
 */
function fileStem(name: string): string {
  const stem = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stem === '' ? 'logo' : stem
}

/**
 * Formats one concept for a text content block.
 *
 * @param logo - The generated concept.
 * @param index - Zero-based concept index.
 * @param total - How many concepts the call produced.
 * @param file - Where the SVG was written, when the caller asked for files.
 * @returns The header line and, for the SVG format, the document.
 */
function formatConcept(
  logo: LogoResult,
  index: number,
  total: number,
  file: string | null
): string {
  const icon = logo.icon === null ? 'none' : logo.icon.key
  const header = [
    `Concept ${index + 1} of ${total}`,
    `engine: ${logo.engine}`,
    `palette: ${logo.palette.id}`,
    `typeface: ${logo.font.family} ${logo.font.weight}`,
    `pictogram: ${icon}`,
    `seed: ${logo.seed}`,
    ...(file === null ? [] : [`file: ${file}`]),
  ].join(' · ')
  return `${header}\n${logo.svg}`
}

/** Brand inputs shared by `generate_logo` and `import_logo`. */
const BRAND_FIELDS = {
  name: z
    .string()
    .min(1)
    .describe(
      'Brand name. Letters A–Z are used; other characters are ignored. Its words also steer the mood and pictogram.'
    ),
  keywords: z
    .string()
    .optional()
    .describe('Comma or space separated keywords, e.g. "tech, minimal".'),
  brief: z
    .string()
    .optional()
    .describe('Free-text brief. Words from it are matched alongside the keywords.'),
  engine: z
    .enum(ENGINE_NAMES as [EngineName, ...EngineName[]])
    .optional()
    .describe('Force one engine instead of letting the mood route. See list_options.'),
  palette: z
    .string()
    .optional()
    .describe('Palette id, or a comma separated colour list such as "ink, copper".'),
  font: z.string().optional().describe('Force a typeface id. See list_options.'),
  icon: z.string().optional().describe('Force a pictogram key. See list_options.'),
  seed: z.number().int().optional().describe('Numeric seed mixed into the hash. Default 0.'),
  size: z
    .number()
    .int()
    .min(16)
    .max(4096)
    .optional()
    .describe('Square canvas size in user units. Default 512.'),
  background: z
    .boolean()
    .optional()
    .describe('Emit an opaque background rectangle. Default false (transparent).'),
  preferences: z
    .record(z.string())
    .optional()
    .describe(
      'Hold individual design decisions still across concepts, e.g. {"container":"hexagon", ' +
        '"mode":"ring"}. See list_options for the values each engine accepts.'
    ),
}

/** Formats `render_scene` can return. */
const RENDER_FORMATS = ['svg', 'png', 'both', 'summary'] as const

/** Formats `import_logo` can return. */
const IMPORT_FORMATS = ['scene', 'svg', 'png', 'both', 'summary'] as const

/** A scene ready to be formatted for an MCP result. */
interface ScenePayload {
  scene: LogoScene
  svg: string
  png: Uint8Array | null
  files: string[]
  note: string | null
}

/**
 * Rasterises a scene preview, or explains why it could not.
 *
 * @param svg - The rendered document.
 * @param size - Target square size.
 * @returns PNG bytes, or a note when `sharp` is unavailable.
 */
async function scenePreview(
  svg: string,
  size: number
): Promise<{ png: Uint8Array | null; note: string | null }> {
  try {
    const result = await rasterise(svg, { size })
    return { png: result.data, note: null }
  } catch (error) {
    const message =
      error instanceof RasterSupportError
        ? 'PNG preview needs the optional dependency "sharp"; the SVG is still valid.'
        : `PNG preview failed: ${error instanceof Error ? error.message : String(error)}`
    return { png: null, note: message }
  }
}

/**
 * Builds a scene payload and, when asked, writes its files.
 *
 * @param scene - A normalised scene.
 * @param needsPng - Whether the caller asked for a raster preview.
 * @param previewSize - Target square size for the preview.
 * @param outputDir - Directory to write into, or `undefined`.
 * @returns The payload used by the result formatter.
 */
async function buildScenePayload(
  scene: LogoScene,
  needsPng: boolean,
  previewSize: number,
  outputDir: string | undefined
): Promise<ScenePayload> {
  const svg = renderScene(scene)
  const preview = needsPng ? await scenePreview(svg, previewSize) : { png: null, note: null }
  const files = await writeSceneFiles(svg, scene, preview.png, outputDir)
  return { scene, svg, png: preview.png, files, note: preview.note }
}

/**
 * Formats a scene failure as an MCP error result.
 *
 * @param error - The thrown value.
 * @returns An error result naming the problem.
 */
function sceneFailure(error: unknown): {
  isError: true
  content: { type: 'text'; text: string }[]
} {
  const message =
    error instanceof SceneError || error instanceof Error ? error.message : String(error)
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Sigilgen could not draw the scene: ${message}` }],
  }
}

/**
 * Formats a scene payload for the MCP result envelope.
 *
 * @param payload - The rendered scene and its optional files.
 * @param format - Which representation the caller asked for.
 * @param bothText - When `both` is requested, whether the text block is SVG or the scene JSON.
 * @returns Tool content blocks.
 */
function sceneContent(
  payload: ScenePayload,
  format: (typeof RENDER_FORMATS)[number] | (typeof IMPORT_FORMATS)[number],
  bothText: 'svg' | 'scene'
): { content: (TextBlock | ImageBlock)[] } {
  const header = sceneHeader(payload.scene, payload.files)
  const blocks: (TextBlock | ImageBlock)[] = []
  if (format === 'summary') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              title: payload.scene.title ?? null,
              size: payload.scene.size,
              palette: payload.scene.palette,
              font: payload.scene.font,
              elementCount: payload.scene.elements.length,
              elements: payload.scene.elements.map(element => ({
                id: element.id,
                type: element.type,
                name: element.name ?? null,
                hidden: element.hidden === true,
              })),
              files: payload.files,
              note: payload.note,
            },
            null,
            2
          ),
        },
      ],
    }
  }
  const wantsScene = format === 'scene' || (format === 'both' && bothText === 'scene')
  const wantsSvg = format === 'svg' || (format === 'both' && bothText === 'svg')
  if (wantsScene) {
    blocks.push({ type: 'text', text: `${header}\n${JSON.stringify(payload.scene, null, 2)}` })
  } else if (wantsSvg) {
    blocks.push({ type: 'text', text: `${header}\n${payload.svg}` })
  } else {
    blocks.push({ type: 'text', text: header })
  }
  if (payload.png !== null) {
    blocks.push(imageBlock(payload.png))
  }
  if (payload.note !== null) {
    blocks.push({ type: 'text', text: payload.note })
  }
  return { content: blocks }
}

/**
 * Creates the Sigilgen MCP server with every tool and resource registered.
 *
 * Kept separate from the transport entry point so tests can connect it over an in-memory transport
 * without spawning a process.
 *
 * @returns An unconnected server; the caller supplies the transport.
 */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Sigilgen draws deterministic, flat geometric SVG logo concepts from a brand name and ' +
        'keywords. The same input always returns byte-identical output — nothing here calls a model ' +
        'or the network. Call generate_logo with a name and, optionally, keywords or a brief. To draw ' +
        'a mark yourself, read sigilgen://scene/schema and call render_scene with a scene document; ' +
        'import_logo converts a generated concept into that editable scene format. Read list_options ' +
        '(or the sigilgen://options/* resources) before pinning an engine, palette, font or ' +
        'pictogram id, so the value you pass is one the generator actually knows.',
    }
  )

  server.registerTool(
    'generate_logo',
    {
      title: 'Generate logos',
      description:
        'Generate between one and six deterministic logo concepts for a brand. Returns each concept ' +
        'with its SVG (default), or a JSON summary without the SVG. Output is byte-identical for ' +
        'identical input. The brand name\'s own words are matched too: "Northwind Coffee" reaches the ' +
        'coffee mood and a coffee pictogram without repeating the word in keywords.',
      inputSchema: {
        ...BRAND_FIELDS,
        variations: z
          .number()
          .int()
          .min(1)
          .max(6)
          .optional()
          .describe('How many concepts to generate. Default 3.'),
        format: z
          .enum(['svg', 'summary'])
          .optional()
          .describe(
            'svg returns each concept with its markup; summary returns JSON metadata only.'
          ),
        outputDir: z
          .string()
          .optional()
          .describe('When set, each SVG is written into this directory as <stem>-<n>.svg.'),
      },
    },
    async ({ format, outputDir, ...config }) => {
      let logos: LogoResult[]
      try {
        logos = generateLogos(config as GenerateOptions)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Sigilgen could not generate a logo: ${message}` },
          ],
        }
      }

      const files = await writeConcepts(logos, config.name, outputDir)
      if (format === 'summary') {
        const summary = logos.map((logo, index) => ({
          index: index + 1,
          engine: logo.engine,
          palette: logo.palette.id,
          typeface: `${logo.font.family} ${logo.font.weight}`,
          pictogram: logo.icon === null ? null : logo.icon.key,
          seed: logo.seed,
          file: files[index] ?? null,
          notes: logo.conceptNotes,
        }))
        return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] }
      }

      return {
        content: logos.map((logo, index) => ({
          type: 'text' as const,
          text: formatConcept(logo, index, logos.length, files[index] ?? null),
        })),
      }
    }
  )

  server.registerTool(
    'render_scene',
    {
      title: 'Draw a scene',
      description:
        'Draw a flat SVG logo from a scene document: ordered rectangles, circles, ellipses, polygons, ' +
        'stars, rings, paths, text runs and pictograms. Returns the SVG and/or a PNG preview. The scene ' +
        'schema and a worked example are at sigilgen://scene/schema. Coordinates are user units on a ' +
        'square canvas with the origin at the top-left; colours may be hex, a CSS colour name, or a ' +
        'palette role (primary, secondary, accent, highlight, background). Text is compiled from the ' +
        'brain’s outlines, so no system font is involved.',
      inputSchema: {
        scene: SCENE_SCHEMA.describe('The scene to draw.'),
        format: z
          .enum(RENDER_FORMATS)
          .optional()
          .describe(
            'svg returns the document; png returns a preview image; both (default) returns SVG and a PNG; summary returns metadata only.'
          ),
        previewSize: z
          .number()
          .int()
          .min(64)
          .max(1024)
          .optional()
          .describe('PNG preview size in pixels. Default 512.'),
        outputDir: z
          .string()
          .optional()
          .describe('When set, writes <title>.svg, <title>.scene.json and a PNG preview.'),
      },
    },
    async ({ scene, format = 'both', previewSize = 512, outputDir }) => {
      let normal: LogoScene
      try {
        normal = normaliseScene(scene)
      } catch (error) {
        return sceneFailure(error)
      }
      const needsPng = format === 'png' || format === 'both'
      try {
        const payload = await buildScenePayload(normal, needsPng, previewSize, outputDir)
        return sceneContent(payload, format, 'svg')
      } catch (error) {
        return sceneFailure(error)
      }
    }
  )

  server.registerTool(
    'import_logo',
    {
      title: 'Import a generated logo as a scene',
      description:
        'Run the curated generator once, then return that concept as an editable scene. Use this to ' +
        'start from the generated mark and refine it with render_scene, rather than drawing from a ' +
        'blank canvas. Returns the scene JSON and a PNG preview by default; format "svg" returns the ' +
        'equivalent SVG, and "summary" returns metadata only.',
      inputSchema: {
        ...BRAND_FIELDS,
        format: z
          .enum(IMPORT_FORMATS)
          .optional()
          .describe(
            'scene returns the editable document; svg returns markup; png returns a preview; both (default) returns the scene and a PNG; summary returns metadata only.'
          ),
        previewSize: z
          .number()
          .int()
          .min(64)
          .max(1024)
          .optional()
          .describe('PNG preview size in pixels. Default 512.'),
        outputDir: z
          .string()
          .optional()
          .describe('When set, writes <name>.svg, <name>.scene.json and a PNG preview.'),
      },
    },
    async ({ format = 'both', previewSize = 512, outputDir, ...config }) => {
      let scene: LogoScene
      try {
        const [logo] = generateLogos({ ...config, variations: 1 } as GenerateOptions)
        if (logo === undefined) {
          throw new Error('the generator returned no concept')
        }
        scene = sceneFromLogo(logo, config.name)
      } catch (error) {
        return sceneFailure(error)
      }
      const needsPng = format === 'png' || format === 'both'
      try {
        const payload = await buildScenePayload(scene, needsPng, previewSize, outputDir)
        return sceneContent(payload, format, 'scene')
      } catch (error) {
        return sceneFailure(error)
      }
    }
  )

  server.registerTool(
    'list_options',
    {
      title: 'List generator options',
      description:
        'List the ids generate_logo accepts for one catalogue: engines, palettes, fonts, pictograms ' +
        'or moods. Returns JSON.',
      inputSchema: {
        kind: z
          .enum(['engines', 'palettes', 'fonts', 'icons', 'moods'])
          .describe('Which catalogue to return.'),
      },
    },
    async ({ kind }) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(catalogue(kind), null, 2) }],
    })
  )

  for (const kind of ['engines', 'palettes', 'fonts', 'icons', 'moods'] as const) {
    server.registerResource(
      kind,
      `sigilgen://options/${kind}`,
      {
        title: `Sigilgen ${kind}`,
        description: `The ${kind} the generator accepts, as JSON.`,
        mimeType: 'application/json',
      },
      async (uri: URL) => ({
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(catalogue(kind)) },
        ],
      })
    )
  }

  server.registerResource(
    'scene-schema',
    'sigilgen://scene/schema',
    {
      title: 'Sigilgen scene schema',
      description:
        'The scene document grammar, shared element fields and a worked example for render_scene.',
      mimeType: 'application/json',
    },
    async (uri: URL) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(SCENE_GUIDE, null, 2) },
      ],
    })
  )

  return server
}

/**
 * Writes each concept into a directory, when one was asked for.
 *
 * @param logos - The concepts to write.
 * @param name - Brand name, used for the file stem.
 * @param outputDir - Destination, or `undefined` to write nothing.
 * @returns One absolute path per concept, or an empty list.
 */
async function writeConcepts(
  logos: readonly LogoResult[],
  name: string,
  outputDir: string | undefined
): Promise<string[]> {
  if (outputDir === undefined) {
    return []
  }
  // Imported lazily so the stdio entry point stays free of filesystem work until a tool asks for it.
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join, resolve } = await import('node:path')
  const directory = resolve(outputDir)
  await mkdir(directory, { recursive: true })
  const stem = fileStem(name)
  const paths: string[] = []
  for (const [index, logo] of logos.entries()) {
    const file = join(directory, `${stem}-${index + 1}.svg`)
    await writeFile(file, logo.svg, 'utf8')
    paths.push(file)
  }
  return paths
}

/**
 * Writes a scene's SVG, its editable JSON and, when available, its preview PNG.
 *
 * @param svg - The rendered SVG document.
 * @param scene - The normalised scene.
 * @param png - Preview bytes, or `null` when rasterisation was not requested or unavailable.
 * @param outputDir - Destination, or `undefined` to write nothing.
 * @returns One absolute path per file, or an empty list.
 */
async function writeSceneFiles(
  svg: string,
  scene: LogoScene,
  png: Uint8Array | null,
  outputDir: string | undefined
): Promise<string[]> {
  if (outputDir === undefined) {
    return []
  }
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join, resolve } = await import('node:path')
  const directory = resolve(outputDir)
  await mkdir(directory, { recursive: true })
  const stem = fileStem(scene.title ?? 'scene')
  const files: string[] = []
  const svgFile = join(directory, `${stem}.svg`)
  await writeFile(svgFile, svg, 'utf8')
  files.push(svgFile)
  const sceneFile = join(directory, `${stem}.scene.json`)
  await writeFile(sceneFile, `${JSON.stringify(scene, null, 2)}\n`, 'utf8')
  files.push(sceneFile)
  if (png !== null) {
    const pngFile = join(directory, `${stem}.png`)
    await writeFile(pngFile, Buffer.from(png))
    files.push(pngFile)
  }
  return files
}
