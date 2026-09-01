# Removing the pop-up glass

The liquid-glass material on the five `.link-pop` preview panels — the four
ArtStation portfolio pop-ups that open off the Experience work tiles, and the
résumé preview that drops out of the hero button: backdrop refraction, a
chromatic rim, and the page behind the panel bending at its edge.

The material is deliberately the same one `.header-inner` is made of, arrived
at the same way `call-glass.css` arrived at it for the meeting panel: a thin
tint under the header's two-stop specular, `--glass-rim` for the edge, and no
painted border of any kind. Nothing here draws a *line* around anything. Most
of the colour at the edge comes from the three-pass displacement in `glass.js`,
where each channel bends by a different amount, so it appears only where the
surface actually curves — joined by a painted fringe (`.link-pop::after`) that
is soft-edged, directional and carries only two hues. That fringe exists
because real dispersion needs contrast behind the glass to split, and these
panels routinely open over the flat upper half of a timeline card where there
is none.

Added as a self-contained, reversible feature on top of the existing panels —
it re-draws what they are *made of*. It does not change where they sit, how big
they are, when they open, or how they animate.

Removing it returns all five panels to the opaque white ones `styles.css`
draws.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Render the link preview panels in liquid glass' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm pop-glass.css pop-glass.js REMOVE-POP-GLASS.md
```

**2. Unlink it** in `index.html` — two commented blocks:

```sh
grep -n "\[pop-glass\]" index.html
```

That lists two sites: the `<link>` after `call-glass.css` in the `<head>`, and
the `<script>` after `call-glass.js`. Delete each comment along with the tag it
introduces.

That is the entire removal. `styles.css`, `glass.js`, `script.js`,
`dark-mode.css`, `call-glass.*`, `call-popup.*` and everything else were never
touched — there is no edit anywhere to reverse.

## Why there is no markup to unpick

The panels already had every element this needs. `.link-pop` is the surface,
`.link-pop-strip` is the scroll box, `.link-pop-shot` is each screenshot's own
opaque slot, and `.link-pop-foot` is the caption row that ends up sitting
directly on the glass. `pop-glass.js` adds
one attribute — `data-pg="lit"` — to a panel the first time it is hovered, and
nothing else. Delete the script and no panel is ever lit.

Note that `.link-pop::before` is **not** used by this feature. `styles.css`
owns it, where it is the invisible bridge across the 12px gap that keeps a
panel reachable by pointer; taking it would make every panel close the moment
the pointer left the tile. The chromatic fringe is on `::after`, which was free.

## Turning it off without deleting it

Every rule in `pop-glass.css` is scoped to `.link-pop[data-pg='lit']`, a hook
only `pop-glass.js` sets. Removing the `<script>` tag alone leaves the
stylesheet loaded and completely inert — the panels fall back to `styles.css`'s
opaque ones, intact.

The script also declines to light anything when the visitor asks for
`prefers-reduced-transparency: reduce` or `prefers-contrast: more`, or is on a
device with no hover at all. That is the same fallback path, taken
automatically.

## Why the glass is applied on hover rather than at load

This is the one non-obvious thing in the feature, and it is deliberate.

`[scroll-paint]` took `backdrop-filter` off `.timeline-item` because the page
carried about 33 of them, each one a compositing layer, and Chrome would drop
one mid-scroll and paint the card as a flat fill with its contents missing.
Five permanent layers for panels that are hidden and that most visitors never
open is the same mistake at smaller scale, so `pop-glass.js` attaches the lens
to a panel the first time its group is hovered and not before. At rest the page
carries none.

There is no visible cost to waiting. The panel sits behind a 0.12s transition
delay before it even starts to fade in, so the map is built and the filter is
on the element several frames before there is anything on screen to look
through.

This is the same trigger `script.js` already uses to hold back the panels'
couple of megabytes of screenshots, but the two are independent: neither binds
on the other, and removing either leaves the other working.

## What removing it does *not* affect

- **The panels themselves.** Position, width, the scrolling strip, the open and
  close curves, the hover bridge, `Escape` to dismiss, the lazy image swap and
  the 404 fallback are all `styles.css` and `script.js`, untouched.
- **The header.** `script.js` builds its lens from the same `liquidGlass()`
  this reuses, and this adds nothing to `glass.js`.
- **The call button and its pop-up.** `call-glass.*` is a separate feature on a
  separate element. The two share `glass.js` and a design vocabulary, nothing
  else.

## If you keep it but want to retune it

The one thing to know first: **the images are not glass and must not become
glass.** Each `.link-pop-shot` stays opaque — on the gradient `styles.css`
already gives it — precisely so the screenshots stay sharp while the frame
around them is translucent. That split, glass frame and solid content, is the
whole reason this could be applied to a panel `styles.css` had deliberately
kept opaque. Make a shot translucent and you get the muddy panel that comment
was warning about.

The second thing: **the opaque surface stops at the shot, and must not spread
to the strip.** `.link-pop-strip` is a flex column with a `gap`, so a
background on it paints through every seam between the images and through the
strip's head and tail. That is what an earlier version did, and against dark
screenshots those seams read as hard white bars ruled across the panel — worst
around the two 800×64 banner frames in the Hitwicket strip. The two `none`
declarations on `.link-pop-strip` are load-bearing for that reason, and the
`gap: 10px` beside them is what makes the reopened seam wide enough to read as
material rather than as a mistake.

What separates the shots is not a fill but depth: each carries a hairline
(`--pg-shot-edge`) and a soft drop shadow, so the channel between two dark
screenshots is darkest at its edges and lifts in the middle. Flatten those
shadows and the seams go back to reading as bars, whatever their width.

Two numbers do most of the work, both in `pop-glass.js`:

| | what it does |
|---|---|
| `scale` | px the backdrop bends at the panel rim. Set against `band` the way the header's is — displacement a few times the band it is spread over is what makes the edge visibly bend the page behind it rather than just tint it. Held at ~2.7x here against the header's 4.3x, because this is a thin rim on a large pane rather than a 60px bar that is nearly all rim. |
| `dispersion` | the width of the colour split. `0.34` is the ceiling: the outer channel lands at scale 147 against a 40px band, and past roughly 4x the band the rim samples outside Chromium's element-clipped backdrop capture and the fringe stops being a fringe — it becomes a saturated smear along the bottom edge. |

The painted fringe is tuned in `pop-glass.css` instead, on `.link-pop::after`
and the two `--pg-fringe-*` tokens. The inset shadows are the wet edge, the
outer pair is its spill onto the page; the negative spread is what keeps them
soft. Turn the tokens transparent and the edge falls back to whatever the lens
alone is producing — which over a flat card is very little, which is why they
are there.

`blur` lives only in `pop-glass.js` — unlike `call-glass`, there is no second
copy of it in the stylesheet to keep in sync, because `glass.js` writes the
whole `backdrop-filter` itself in both the lens and the fallback case.

If the bullet list behind a panel starts reading through it, raise `--pg-panel`
rather than the blur. Blur and refraction are in direct competition: frost is
what dissolves the very bend the lens is creating.

`--pg-panel` is held at `0.36` against `call-glass`'s `0.32`, because these
panels open over a translucent card with body copy on it rather than over a
flat section, and because a strip of photographs reads as a hard object that
wants a little more surface around it. It is still well under the `0.42`
`--glass-surface` of the card behind it, which is what keeps the two legible as
two panes rather than one thick one.
