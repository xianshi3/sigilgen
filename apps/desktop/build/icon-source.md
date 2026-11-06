# App icon source

`icon-source.svg` is the exact output of the Sigilgen MCP server's `generate_logo` tool.

```json
{
  "name": "Sigil Gen",
  "keywords": "geometry, seal, deterministic, studio",
  "engine": "monogram",
  "preferences": { "container": "hexagon" },
  "seed": 1,
  "palette": "#141210,#F3ECDF,#C65A32",
  "size": 1024,
  "background": true,
  "variations": 1
}
```

The two words are deliberate: the monogram engine derives `SG` from the initials, which is the
shortest mark that still names **Sigil Gen**. The container is a hexagon — the geometric form used
throughout the studio — and the letters fit the container's cap band after the multi-letter width fix.
It was selected from a sheet of circle, squircle, hexagon, shield and seal variants and checked at
128, 64 and 32 px.

`pnpm --dir apps/desktop run icons` rounds the square and writes `icon.png` and `icon.ico`.
`apps/web/public/favicon.svg` is the same mark for the browser tab.

Replacing the app icon means replacing this SVG, not editing the generator script.
