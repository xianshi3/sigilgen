#!/usr/bin/env node
/**
 * The stdio entry point.
 *
 * A stdio MCP server owns stdout: the protocol runs through it as newline-delimited JSON, so a
 * single `console.log` corrupts the session. Every diagnostic goes to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

/**
 * Starts the server and waits for the client to drive it.
 *
 * @returns A promise that settles when the transport closes.
 */
async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error: unknown) => {
  console.error('sigilgen-mcp failed to start:', error)
  process.exit(1)
})
