import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer, SERVER_NAME } from '../src/server.js'

/**
 * The MCP surface, exercised over a real protocol session.
 *
 * The server is connected to a client through the SDK's in-memory transport rather than by spawning a
 * process: the handshake, schema validation and result envelopes are all the same code, and the suite
 * stays fast enough to run on every change.
 */

interface Session {
  client: Client
  close: () => Promise<void>
}

const open: Session[] = []

/**
 * Opens a fresh server/client pair.
 *
 * @returns The connected client and a closer.
 */
async function connect(): Promise<Session> {
  const server = createServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'sigilgen-test', version: '1.0.0' })
  await client.connect(clientTransport)
  const session: Session = {
    client,
    close: async () => {
      await client.close()
      await server.close()
    },
  }
  open.push(session)
  return session
}

/** Text blocks from a tool result, in order. */
function texts(result: unknown): string[] {
  if (typeof result !== 'object' || result === null) {
    return []
  }
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) {
    return []
  }
  return content
    .filter((block): block is { type: 'text'; text: string } => {
      return (
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: string }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
      )
    })
    .map(block => block.text)
}

afterEach(async () => {
  while (open.length > 0) {
    await open.pop()?.close()
  }
})

describe('handshake', () => {
  it('announces itself and its two tools', async () => {
    const { client } = await connect()
    expect(client.getServerVersion()?.name).toBe(SERVER_NAME)
    const { tools } = await client.listTools()
    const names = tools.map(tool => tool.name).toSorted()
    expect(names).toEqual(['generate_logo', 'list_options'])
    const generate = tools.find(tool => tool.name === 'generate_logo')
    expect(generate?.inputSchema.required).toContain('name')
  })
})

describe('generate_logo', () => {
  it('returns one SVG block per concept', async () => {
    const { client } = await connect()
    const result = await client.callTool({ name: 'generate_logo', arguments: { name: 'Acme' } })
    expect(result.isError).toBeFalsy()
    const blocks = texts(result)
    expect(blocks).toHaveLength(3)
    for (const block of blocks) {
      expect(block).toContain('<svg')
      expect(block).toContain('engine:')
      expect(block).toContain('seed:')
    }
  })

  it('is byte-identical for identical input', async () => {
    // The generator's contract, through the protocol: same call, same bytes.
    const { client } = await connect()
    const args = { name: 'Northwind Coffee', keywords: 'coffee, artisan', seed: 7 }
    const first = await client.callTool({ name: 'generate_logo', arguments: args })
    const second = await client.callTool({ name: 'generate_logo', arguments: args })
    expect(texts(first)).toEqual(texts(second))
  })

  it('honours a forced engine', async () => {
    const { client } = await connect()
    const result = await client.callTool({
      name: 'generate_logo',
      arguments: { name: 'Vela', engine: 'scanline', variations: 2 },
    })
    const blocks = texts(result)
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      expect(block).toContain('engine: scanline')
    }
  })

  it('reports a rejected name instead of throwing', async () => {
    const { client } = await connect()
    const result = await client.callTool({ name: 'generate_logo', arguments: { name: '!!!' } })
    expect(result.isError).toBe(true)
    expect(texts(result).join(' ')).toContain('letter')
  })

  it('rejects arguments outside the schema', async () => {
    const { client } = await connect()
    const result = await client.callTool({
      name: 'generate_logo',
      arguments: { name: 'Acme', variations: 9 },
    })
    expect(result.isError).toBe(true)
  })

  it('returns a JSON summary without markup when asked', async () => {
    const { client } = await connect()
    const result = await client.callTool({
      name: 'generate_logo',
      arguments: { name: 'Acme', format: 'summary' },
    })
    const text = texts(result).join('\n')
    expect(text).not.toContain('<svg')
    const summary = JSON.parse(text) as { engine: string; seed: string }[]
    expect(summary).toHaveLength(3)
    expect(summary[0]?.engine).toBeTruthy()
    expect(summary[0]?.seed).toBeTruthy()
  })

  it('writes files when an output directory is given', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sigilgen-mcp-'))
    try {
      const { client } = await connect()
      const result = await client.callTool({
        name: 'generate_logo',
        arguments: { name: 'Northwind Coffee', variations: 2, outputDir: directory },
      })
      expect(result.isError).toBeFalsy()
      const files = (await readdir(directory)).toSorted()
      expect(files).toEqual(['northwind-coffee-1.svg', 'northwind-coffee-2.svg'])
      const svg = await readFile(join(directory, 'northwind-coffee-1.svg'), 'utf8')
      expect(svg.startsWith('<svg')).toBe(true)
      for (const block of texts(result)) {
        expect(block).toContain('file:')
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('list_options', () => {
  it('lists every engine with a hint', async () => {
    const { client } = await connect()
    const result = await client.callTool({
      name: 'list_options',
      arguments: { kind: 'engines' },
    })
    const engines = JSON.parse(texts(result).join('')) as { id: string; hint: string }[]
    expect(engines).toHaveLength(9)
    expect(engines.map(engine => engine.id)).toContain('pictogram')
    for (const engine of engines) {
      expect(engine.hint.length).toBeGreaterThan(0)
    }
  })

  it('returns the palettes a caller can pin', async () => {
    const { client } = await connect()
    const result = await client.callTool({ name: 'list_options', arguments: { kind: 'palettes' } })
    const palettes = JSON.parse(texts(result).join('')) as { id: string }[]
    expect(palettes.map(palette => palette.id)).toContain('ink-monolith')
  })
})

describe('resources', () => {
  it('lists the option catalogues', async () => {
    const { client } = await connect()
    const { resources } = await client.listResources()
    const uris = resources.map(resource => resource.uri).toSorted()
    expect(uris).toEqual([
      'sigilgen://options/engines',
      'sigilgen://options/fonts',
      'sigilgen://options/icons',
      'sigilgen://options/moods',
      'sigilgen://options/palettes',
    ])
  })

  it('serves a catalogue as JSON', async () => {
    const { client } = await connect()
    const { contents } = await client.readResource({ uri: 'sigilgen://options/fonts' })
    const first = contents[0] as { text?: string; mimeType?: string }
    expect(first.mimeType).toBe('application/json')
    const fonts = JSON.parse(first.text ?? '[]') as { id: string; family: string }[]
    expect(fonts.length).toBeGreaterThanOrEqual(12)
    expect(fonts[0]?.family).toBeTruthy()
  })
})
