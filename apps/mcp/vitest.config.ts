import { defineConfig } from 'vitest/config'

/**
 * The MCP suite runs in node: the server is stdio and filesystem, with no DOM in sight.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
