# ADR-004 — Scenes are a document, not an engine

- **Status:** Accepted
- **Date:** 2026-11-06
- **Context:** The studio and the MCP server can only ask the curated generator for a mark. A reader or a
  language model cannot compose, move or add individual shapes, and a generated SVG cannot be edited
  back into a document because its paths have already lost the decisions that produced them.

## Decision

Add a second document type, `LogoScene`, and a renderer that compiles it through the existing
`SVGElement` tree and `serialiseDocument` safety boundary.

A scene is a square canvas of ordered flat elements: rectangles, circles, ellipses, polygons, stars,
rings, paths, text runs compiled from the brain's outlines, and brain pictograms. Elements carry
identity, layer names, visibility, translation, rotation, scale, opacity, fill, stroke and fill rule.
Colours may name palette roles, so a palette change recolours the whole drawing without touching literal
colours.

The studio gains a **Draw** workspace that edits the scene and imports a generated concept with
`sceneFromLogo`. MCP gains `render_scene` and `import_logo`, plus a `sigilgen://scene/schema` resource;
the renderer can return a PNG preview so a model can see what it drew. Scenes are persisted with the
studio state and are part of the existing undo history.

Scenes are deliberately **not** a tenth engine. They do not route through the mood rules, consume a
seed, or appear in `ENGINE_NAMES`. The generator's determinism tests and the scene's determinism tests
are separate concerns.

## Consequences

- The root library gains `src/scene.ts` with no runtime dependencies; `sharp` remains optional and only
  the PNG path reaches for it.
- `serialiseDocument` remains the only writer. A scene cannot introduce a gradient, filter, mask, image
  or script, because the serializer's allow-list is unchanged.
- Text is compiled to outlines from `fonts.json`; there is no `<text>` element in output and no font
  parsing in the browser or in MCP.
- The studio has two workspaces that share the sheet, zoom, backdrops, snapping and panel layout.
- MCP `render_scene` is stateless: the caller sends the complete scene. This keeps the call reproducible
  and avoids server-side session state; the trade-off is resending larger documents.
- A PNG preview is an image content block, not a file protocol. Clients that cannot display images still
  receive the SVG and scene JSON.

## Alternatives considered

- **Add a tenth engine that accepts a scene.** Rejected: it would put an arbitrary document behind the
  routing table and force the brain to describe things it did not choose.
- **Mutate generated SVG paths in place.** Rejected: the editor would depend on the current engine's
  output shape, and importing a concept would not be a stable snapshot.
- **Use an image-generation model for freeform logos.** Rejected: the output would not be editable,
  deterministic, or flat vector geometry, and the product's value is the opposite of that.
- **Server-side drawing sessions.** Rejected for the first version: a stateless full-document call is
  easier to reproduce and cannot expire or be corrupted between calls.
