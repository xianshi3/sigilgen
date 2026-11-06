# Icon data

`icons.json` is Sigilgen's curated pictogram catalogue. Its **paths** come from
[Material Design Icons](https://materialdesignicons.com), published by the
[Pictogrammers](https://pictogrammers.com) group under the Apache 2.0 licence; the full text is in
[`icons.LICENSE`](icons.LICENSE). The keys, categories, tags and their mapping to moods are Sigilgen's.

- Package: `@mdi/js` 7.4.47
- Grid: `0 0 24 24`, filled paths
- Mapping and generator: [`scripts/build-icons.mjs`](../../scripts/build-icons.mjs)

The path values are generated, not hand-edited:

```bash
pnpm run build:icons   # rewrite the paths from the pinned @mdi/js package
pnpm run check:icons   # fail when the committed paths do not match the generator
```

To change an icon, edit `MAPPING` in the generator, run `build:icons`, and review the rendered sheet.
The key, category and tags in `icons.json` are preserved by the generator.
