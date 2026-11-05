# Sigilgen MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server for Sigilgen. Any MCP client —
Claude Desktop, Cursor, VS Code, an agent framework — can generate deterministic, flat SVG logo
concepts without leaving the conversation.

The server is an adapter, not a second generator: every design decision still comes from Sigilgen's
curated JSON brain, and the same call always returns the same bytes.

## Tools

| Tool            | What it does                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `generate_logo` | Generate 1–6 concepts for a brand. Returns each concept's SVG (default) or a JSON summary. Can write files into a directory. |
| `list_options`  | The ids the generator accepts, one catalogue at a time: `engines`, `palettes`, `fonts`, `icons`, `moods`.                    |

### `generate_logo` arguments

| Argument        | Type               | Notes                                                                                                                          |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `name`          | string             | **Required.** Letters `A`–`Z` are used; other characters are ignored.                                                          |
| `keywords`      | string             | Comma or space separated, e.g. `"tech, minimal"`.                                                                              |
| `brief`         | string             | Free text; its words are matched alongside the keywords.                                                                       |
| `engine`        | string             | Force an engine: `monogram`, `wordmark`, `lettermark`, `apparatus`, `abstract`, `emblem`, `pictogram`, `halftone`, `scanline`. |
| `palette`       | string             | A palette id, or a colour list such as `"ink, copper"`.                                                                        |
| `font` / `icon` | string             | Force a typeface id / pictogram key.                                                                                           |
| `seed`          | integer            | Mixed into the hash. Default `0`.                                                                                              |
| `size`          | integer            | Square canvas, 16–4096. Default `512`.                                                                                         |
| `variations`    | integer            | 1–6 concepts. Default `3`.                                                                                                     |
| `background`    | boolean            | Emit an opaque background rectangle. Default transparent.                                                                      |
| `preferences`   | object             | Hold decisions still, e.g. `{"container": "hexagon"}`.                                                                         |
| `format`        | `svg` \| `summary` | `svg` (default) returns the markup; `summary` returns JSON metadata only.                                                      |
| `outputDir`     | string             | When set, writes `<stem>-<n>.svg` into that directory.                                                                         |

## Resources

Five JSON resources mirror `list_options`, for clients that read resources:

- `sigilgen://options/engines`
- `sigilgen://options/palettes`
- `sigilgen://options/fonts`
- `sigilgen://options/icons`
- `sigilgen://options/moods`

## Install and run

The server consumes the **built** library, so build the repository root first:

```bash
pnpm install
pnpm build
pnpm --dir apps/mcp install
pnpm --dir apps/mcp build
```

Then point a client at `apps/mcp/dist/index.js` (or the `sigilgen-mcp` bin once linked).

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sigilgen": {
      "command": "node",
      "args": ["D:/Engineering-Project/Sigilgen/apps/mcp/dist/index.js"]
    }
  }
}
```

### Cursor

`.cursor/mcp.json` in a project, or the global equivalent:

```json
{
  "mcpServers": {
    "sigilgen": {
      "command": "node",
      "args": ["D:/Engineering-Project/Sigilgen/apps/mcp/dist/index.js"]
    }
  }
}
```

### Any stdio client

Speak newline-delimited JSON-RPC over the process's stdin/stdout. A single `console.log` would
corrupt the session, so the server writes diagnostics to stderr only.

## Try it without a client

```bash
node dist/index.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"shell","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"generate_logo","arguments":{"name":"Vela","engine":"halftone","variations":2}}}
EOF
```

## Development

| Task      | Command              |
| --------- | -------------------- |
| Typecheck | `pnpm run typecheck` |
| Test      | `pnpm run test`      |
| Full gate | `pnpm run check`     |

The suite drives a real MCP session over the SDK's in-memory transport: handshake, `tools/list`,
`tools/call`, schema rejection, file output and resource reads all go through the same code path a
client uses. It imports the built `sigilgen` package, so run `pnpm build` at the repository root
before the first test run — a library change is a server change, with a rebuild in between.
