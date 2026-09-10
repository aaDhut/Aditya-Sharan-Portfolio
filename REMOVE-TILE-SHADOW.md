# Removing `tile-shadow`

Cast shadows under the collage tiles, the Experience company-logo marks, and
the Skills pills. Added 2026-09-08.

## What it does

Three things on the page were flat prints on their card. This feature raises
all three:

| Element | Selector | Before |
|---|---|---|
| Collage tiles — 5 Experience, 3 College projects, 1 certificate | `.work-tile` | Had a shadow, but written for the 140px Experience size and built on `--shadow-rgb`, which dark mode sets to pure black — invisible on a `#1a1a1a` card, and hazy at the 96×72 college size |
| Experience company marks | `a.timeline-logo` | No cast shadow at all, hairline border only |
| Company / institution name pills (Experience + Education) | `.timeline-company a` on hover | A specular rim and a `0.08` contact shade — enough to seat the chip on the card, not to raise it |
| Skills pills | `.tag-list li` | Inset `--glass-rim` only; the drop shadow existed but appeared on `:hover` and nowhere else |

## How to remove it

Two deletions. Nothing else on the page references this feature.

1. In `index.html`, delete the `[tile-shadow]` comment block and its
   stylesheet link (they sit last in `<head>`, after `nav-morph.css`):

   ```html
   <!-- [tile-shadow] Removable feature. Casts a shadow under the collage tiles,
        ... -->
   <link rel="stylesheet" href="tile-shadow.css">
   ```

2. Delete `tile-shadow.css`.

Then delete this file.

## Why that is the whole job

`tile-shadow.css` is a pure override layer. Every rule in it restates a
`box-shadow` that `styles.css` already declares, at matched specificity, and it
wins only because it loads last. **No file outside it was edited** — not
`styles.css`, not `dark-mode.css`, not `college-projects.css`, and no markup
beyond the one `<link>`. Pulling the link restores the previous shadows
exactly, because they were never removed; they were only shadowed by a later
sheet.

Two things worth knowing if you edit rather than remove: the file also adds
`box-shadow` to the `transition` list on `a.timeline-logo`. `styles.css`
transitions only `transform` and `border-color` there, so without that line the
logo's shadow would snap while its `scale(1.06)` hover glides. If you keep the
file but drop the logo rules, drop that transition with them.

And the name-pill rule is the one place this file has to win on *weight*
rather than load order: `liquid-buttons.css` owns that chip at `(0,3,1)`, so
the selector here is written to match it exactly. Shortened to
`.timeline-company a:hover` it would silently lose and the pill would go back
to its `0.08` contact shade.

## Verifying the removal

Serve the project (`python3 -m http.server 8791` — not `:5500`, which caches)
and check three places:

- an **Experience** card: the logo mark should sit flat against the card again,
  the collage tile should have its old softer three-layer cast, and hovering
  the company name should give a pill with a rim but no cast
- an **Education** card: same three checks on the IIT Roorkee and Amity rows
- the **College projects** row on the Amity card: three smaller tiles, same
  softer cast
- **Skills & Tools**: pills should be flat at rest and only lift on hover

`grep -rn "tile-shadow" .` should return nothing but this file.

## Tuning instead of removing

Depth is all tokens, defined once per theme at the top of `tile-shadow.css` —
`--ts-tile`, `--ts-logo`, `--ts-pill` and their `-hover` twins. Change those
six and the whole page follows; the rules below them never need touching.

Light and dark are tuned separately and are not a single palette swap. Dark
mode splits the work: the cast carries the height, and a 1px `rgba(255,255,255)`
ring carries the edge, because past roughly 0.6 alpha a black shadow on a
near-black card stops getting darker and only gets bigger. That ring is a
spread layer rather than `inset` on purpose — `.work-tile` is filled edge to
edge by its four thumbnails, and an inset shadow paints under content, so it
would be hidden by the images.
