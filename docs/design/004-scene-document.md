# 004 — The scene document

## Why a second document type

The nine engines answer one question: given a brand and a mood, what mark should this be? Every answer
comes from the curated brain, and every answer is reproducible from the request. That is the product's
contract, and it is the right contract for a generator.

A drawing is a different kind of thing. The reader — or a language model through MCP — has already
decided where the shapes go. The document has to hold those decisions explicitly, survive a reload, be
editable one element at a time, and round-trip through JSON. Mutating the generator's SVG would lose the
element boundaries and make the editor depend on whatever the routing table happened to produce.

So a **scene** is a separate, explicit document. It is not a tenth engine: it does not read the brain's
mood rules, it does not consume a seed, and it does not appear in `ENGINE_NAMES`.

## Shape of a scene

```ts
interface LogoScene {
  version: 1
  title?: string
  size: number // 16..4096, square
  palette: string | null
  font: string | null
  background: string | null
  elements: SceneElement[] // paint order, first at the bottom
}
```

Every element shares:

| Field         | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `id`          | Stable identity for selection and layer operations             |
| `name`        | Optional layer label                                           |
| `hidden`      | Kept in the document, skipped when drawing                     |
| `translate`   | `[x, y]` applied after the element's own geometry              |
| `rotate`      | Degrees, clockwise around the element's own centre             |
| `scale`       | Uniform, around the element's own centre                       |
| `opacity`     | `0..1`                                                         |
| `fill`        | Colour, palette role, or `none`                                |
| `stroke`      | Colour, palette role, or `none`                                |
| `strokeWidth` | User units, default `2`                                        |
| `fillRule`    | `nonzero` or `evenodd` for paths that cut holes with sub-paths |

The primitive types are:

| Type      | Geometry                                                            |
| --------- | ------------------------------------------------------------------- |
| `rect`    | `x`, `y`, `width`, `height`, optional `rx`                          |
| `circle`  | `cx`, `cy`, `r`                                                     |
| `ellipse` | `cx`, `cy`, `rx`, `ry`                                              |
| `polygon` | `points: [x, y][]`, 3–256 vertices                                  |
| `star`    | `cx`, `cy`, `outer`, `inner`, `points`, rotation                    |
| `ring`    | `cx`, `cy`, `rx`, `ry`, `weight`                                    |
| `path`    | Safe `M`/`L`/`C`/`Z` path data                                      |
| `text`    | `text`, `x`, `y`, `width`, `height`, optional `font` and `tracking` |
| `icon`    | A brain pictogram key, `x`, `y`, `size`                             |

### Palette roles

`fill`, `stroke` and `background` accept `#rrggbb`, a CSS colour name, `none`, or one of
`primary`, `secondary`, `accent`, `highlight` and `background`. A role resolves through the scene's
`palette` id, so changing the palette recolours every role-linked element in one operation while
literal colours stay put. A role used without a palette is an error rather than a silent grey.

### Text

A text element is fitted into its box with `fitText`, then compiled to outlines with `textPath` from the
brain's `fonts.json`. Nothing measures text in the browser, nothing parses a font at runtime, and the
exported document contains paths rather than `<text>`. That keeps the flat-SVG contract and makes the
same scene render identically in the browser, in Node and through MCP.

## Pipeline

```text
LogoScene (unknown input)
  → normaliseScene       validate, assign ids, default, clamp
  → sceneToSvgElements   one SVGElement tree per visible element, in paint order
  → serialiseDocument    allow-listed tags/attributes, escaping, flat output
  → SVG string
```

`sceneElementToSvg` compiles one element; the studio renders that same tree through React for live
selection, so the screen and the exported file cannot drift. `sceneElementBounds` applies the element's
translate/rotate/scale to its base geometry, which is what the studio uses to draw a selection outline
without asking the DOM.

## Safety and limits

The scene is untrusted input in both MCP and persisted-storage paths. The normaliser rejects:

- an unknown element type, palette, font or pictogram;
- a missing or non-positive width, height, radius or size;
- unsafe or unparsable path data;
- a colour value that is not a hex literal, a CSS name, a role or `none`;
- more than 256 elements, 256 polygon vertices, 80 text characters or 20,000 path characters.

Positions and sizes are clamped to a generous band around the canvas rather than rejected, because a
model that places a shape just outside the edge has still made a usable drawing. Structural mistakes
are rejected because silently dropping them would leave a blank canvas with no explanation.

## Studio draw mode

The studio gains a **Draw** workspace beside **Generate**. It uses the same 300px panels, sheet, zoom,
backdrops and alignment guides as the generated stage.

- **Tools**: select, rectangle, circle, ellipse, star, ring, text and icon. A tool is one-shot: after
  placing a shape the stage returns to the pointer.
- **Layers**: front-to-back list with visibility, reorder, duplicate and delete.
- **Inspector**: canvas name, palette, default typeface, background, and the selected element's
  geometry, fill, stroke, opacity, rotation and scale. Geometry fields show the element's effective
  position, so typing a coordinate and dragging it mean the same place.
- **Import current logo**: `sceneFromLogo` turns the generated concept into editable paths, so a reader
  can start from the curated mark rather than a blank page.
- **Export**: SVG, scene JSON, and copy-to-clipboard. The SVG goes through the native Save dialog in the
  desktop shell.
- **History**: the existing undo stack stores the edits map and the scene together. A drag is one step;
  a snap that leaves the part where it was records no step at all.

The scene and the workspace are persisted with the rest of the studio state. On load, an invalid scene
becomes absence rather than a white screen; the workspace then opens a blank canvas.

## MCP

Two tools expose the same document:

- `import_logo` runs the generator once and returns the resulting scene, so a model can start from a
  curated concept.
- `render_scene` validates and renders a complete scene, returning SVG and a PNG preview (when `sharp` is
  available). `sigilgen://scene/schema` carries the grammar and a worked example.

A stateless full-scene call was chosen over server-side sessions: the model already holds the document
in context, the call is deterministic, and there is no hidden state to expire or corrupt. Large scenes
may be resent, but the model can also write the scene to disk with `outputDir`.

The preview is the other half of the loop. SVG is text, and a model cannot see it; a PNG image block lets
it check the composition before answering.

## Non-goals

- Freehand Bézier drawing with a pen tool.
- Boolean path operations; the `ring` primitive and `fill-rule` cover the common hole cases.
- Gradients, filters, masks, clip paths, embedded images or external references. The flat-SVG contract
  still applies to scenes.
- Editing a generated concept in place; importing it snapshots its paths.

## Testing

`tests/scene.test.ts` covers determinism, flatness, palette roles, unsafe input, text/icon compilation,
bounds and generated-to-scene conversion. The studio suite covers the draw store and a real pointer drag
with snapping; the MCP suite covers both tools, the PNG content block, file output and the schema
resource.
