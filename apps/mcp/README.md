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
| `import_logo`   | Run the generator once and return that concept as an editable scene, with a PNG preview by default.                          |
| `render_scene`  | Draw an explicit scene of shapes, text and pictograms. Returns SVG and a PNG preview by default.                             |
| `list_options`  | The ids the generator accepts, one catalogue at a time: `engines`, `palettes`, `fonts`, `icons`, `moods`.                    |

The brand name's own words are matched as well: `Northwind Coffee` reaches the coffee mood and a
coffee-cup pictogram without repeating `coffee` in `keywords`. Explicit keywords still outrank the name
when the two disagree.

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

Six JSON resources mirror the tools, for clients that read resources:

- `sigilgen://options/engines`
- `sigilgen://options/palettes`
- `sigilgen://options/fonts`
- `sigilgen://options/icons`
- `sigilgen://options/moods`
- `sigilgen://scene/schema` — the scene grammar, shared element fields and a worked example

## Drawing a scene

`render_scene` takes a complete `LogoScene` rather than a sequence of server-side edits: the call is
stateless, reproducible, and cannot expire between messages. A scene is a square canvas of flat elements
painted in order. Coordinates are user units with the origin at the top-left, and colours may be a hex
literal, a CSS colour name, or a palette role (`primary`, `secondary`, `accent`, `highlight`,
`background`). Roles need a `palette` id; text uses a brain font and is compiled to outlines.

```json
{
  "size": 512,
  "palette": "ink-monolith",
  "font": "inter-bold",
  "elements": [
    { "type": "circle", "cx": 256, "cy": 232, "r": 132, "fill": "primary" },
    { "type": "ring", "cx": 256, "cy": 232, "rx": 106, "ry": 106, "weight": 10, "fill": "accent" },
    { "type": "text", "text": "NORTHWIND", "x": 56, "y": 392, "width": 400, "height": 52 }
  ]
}
```

`import_logo` is the bridge from the curated generator to that document: call it with the same
arguments as `generate_logo`, receive the scene JSON and a preview, edit the scene, and send the result
to `render_scene`. The `format` argument selects `scene`, `svg`, `png`, `both` (the default) or
`summary`; `previewSize` controls the PNG and `outputDir` writes the SVG, the scene JSON and the PNG.

A model cannot see SVG text, which is why the preview is a PNG image content block. A client that cannot
display images still receives the SVG and the scene JSON. PNG needs the optional `sharp` dependency; SVG
works without it.

| Tool           | Arguments                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `render_scene` | `scene` (required), `format` (`svg`, `png`, `both`, `summary`), `previewSize`, `outputDir`         |
| `import_logo`  | the brand arguments from `generate_logo`, plus `format` (`scene`, `svg`, `png`, `both`, `summary`) |

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
