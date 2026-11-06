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
  generateLogos,
  type EngineName,
  type GenerateOptions,
  type LogoResult,
} from 'sigilgen'

/** Name the server reports in the MCP handshake. */
export const SERVER_NAME = 'sigilgen'

/** Version the server reports in the MCP handshake. */
export const SERVER_VERSION = '0.1.0'

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
        'or the network. Call generate_logo with a name and, optionally, keywords or a brief. Read ' +
        'list_options (or the sigilgen://options/* resources) before pinning an engine, palette, ' +
        'font or pictogram id, so the value you pass is one the generator actually knows.',
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
        variations: z
          .number()
          .int()
          .min(1)
          .max(6)
          .optional()
          .describe('How many concepts to generate. Default 3.'),
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
