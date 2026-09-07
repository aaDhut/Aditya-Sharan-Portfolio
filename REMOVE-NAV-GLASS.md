# Removing the nav glass

The nav pills were the only chrome on the page made of fake glass — a flat
white tint while every other capsule got a real displacement lens. This gives
them the real thing. Nothing is recoloured: the accent label is untouched.

Added as a self-contained, reversible feature: two new files and two `<link>`/
`<script>` tags. No existing file was edited.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Give the nav pills a real glass lens' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm nav-glass.css nav-glass.js REMOVE-NAV-GLASS.md
```

**2. Remove the two tags from `index.html`.** Both are tagged `[nav-glass]` —
the stylesheet is the last one in the `<head>`, the script is the last one
before `</body>`. Delete each comment block with its tag.

```sh
grep -n 'nav-glass' index.html
```

`grep -rn 'nav-glass'` should then come back empty. Nothing else references
it: `script.js` is unchanged and goes back to owning the bar's lens outright.

> **If `[nav-morph]` is still installed**, `nav-glass.js` contains a handoff
> that gives the lens to that feature's single travelling capsule instead of to
> the seven pills. Removing `nav-glass` takes the handoff with it, and the
> morph pill simply goes unlensed — `nav-morph.css` falls back to the fuller
> tint on its own, because `data-lens` is what selects the thin one and only
> `nav-glass.js` ever sets it. Nothing to undo in the other direction. See
> `REMOVE-NAV-MORPH.md`.

## The frost layer

`nav-glass.js` also builds a second layer, `.nav-glass-frost`, painted *below*
the plate and carrying nothing but `blur(16px) saturate(1.15)`. It exists
because the bar refracted but never diffused: page content scrolling under it
stayed a legible ghost image behind the labels.

The blur that was supposed to do the diffusing is the tail of the chain
`glass.js` writes — `url(#droplet-N) blur(2px) saturate(1.7)` — and **Chromium
does not honour a CSS blur that follows an SVG `url()` inside a
`backdrop-filter`.** Measured on the bar with the certificates strip passing
under it, the line behind the labels stays readable at `blur(2px)`, at
`blur(8px)` and at `blur(18px)`; the same blur alone, with the lens taken out
of the chain, dissolves it completely. The declaration parses, and the blur is
dropped silently. Moving it into the SVG filter instead is not a way out
either — appending an `feGaussianBlur` to the droplet chain made Chromium drop
the whole filter, displacement included.

Two stacked backdrop-filters are not the compounding problem the plate exists
to avoid. That one is about *nesting*, where a descendant samples its
ancestor's already-flattened output. These are siblings: the frost diffuses the
page, the plate's backdrop is that diffused result, and the lens bends it —
which is also the right order physically, since light scatters through the body
of the glass and refracts at its curved surface.

The lens itself is untouched. `script.js` still owns `band`, `scale` and
`dispersion`; the only new thing is something worth refracting. To remove just
the frost and keep the rest, delete the `frost` block in `nav-glass.js` and the
two `.nav-glass-frost` selectors in `nav-glass.css` — the bar goes straight
back to the ghosting.

## Why it needed a plate

`script.js` says the pills can't have a lens:

> The nav pills deliberately get no lens of their own. A backdrop-filter
> nested inside the bar's own backdrop-filter compounds — the pills render as
> opaque grey slabs.

That is accurate, and it is not a browser limit — it is a consequence of
*where* the bar's lens is attached. `backdrop-filter` on `.header-inner` makes
that element a **backdrop root**: every descendant samples a flattened,
already-composited layer instead of the page, so a pill's own filter has
nothing left to work with.

`nav-glass.js` moves the bar's filter onto a plate `div` inset inside
`.header-inner`. Same size, same filter, so the bar renders the same — but the
pills are no longer descendants of a filtered element. Measured over the
portrait, using colour variation inside the pill as the proxy for "is real
content coming through":

| sampled region | colour variation |
|---|---|
| the bar itself (real glass — reference) | 12.0 |
| pill, nested as before | 2.6 — flat paint |
| pill, after the hoist | **7.7** — about ⅔ of the bar's own |

## The trap, if you ever rebuild this

Clearing `.header-inner`'s **inline** backdrop-filter does not remove it. The
blur is *also* declared in `styles.css`; `script.js`'s lens only overrode it
inline. Clearing the inline value reveals the stylesheet's, `.header-inner`
stays a backdrop root, and the whole bar — not just the pills — renders as the
grey slab. That is why `nav-glass.css` sets `backdrop-filter: none` on
`.header-inner[data-nav-glass]`, and it is the load-bearing line in the file.
Building it without that line measured a mean per-pixel delta of **82.6/255**
against the untouched bar.

## How close the bar stays

Measured with animations frozen — the hero animates under the bar, and without
freezing it the run-to-run noise is larger than the effect being measured
(frozen, two identical runs diff to exactly 0.000):

| | mean delta | pixels past 8/255 |
|---|---|---|
| tint left on `.header-inner` | 2.10 | 4.54% |
| **tint moved to the plate** (shipped) | **0.51** | 0.59% |

The remainder is a 75px-wide band at the rim where the displacement map lands a
fraction differently. The bar is **not** bit-identical — it is half a level of
255, in a band with no detail in it.

## What was verified

- Chromium: real lens attaches (`data-lens`), refraction visible over content,
  lens parks on mouseleave, only the pills actually used build one (1 of 7
  after a single hover).
- Mobile (600px): plate still hoists, lenses skipped — below 720px the links
  are a dropdown, not a row of capsules.
- `prefers-reduced-transparency: reduce`: the script bails before touching
  anything. No plate, bar keeps its own lens, `liquid-buttons.css`'s opaque
  fallback applies unopposed.
- Non-Chromium path, forced by making glass.js's support probe fail: plate
  takes the plain frost, pill takes the frost fallback, `data-lens` correctly
  not set so the thicker tint applies. **This exercised the code path, not
  Safari itself** — the feature has not been run in a real Safari or Firefox.
- No JS errors in any of the above.

## Notes if you keep it

- Lenses are built lazily on first hover/focus/activation and then parked, not
  destroyed — building one rasterises a displacement map, and doing that on
  every hover would be visible. A pill never hovered never builds one.
- The pill is never left with a filter at rest. A `backdrop-filter` on a
  capsule with no capsule drawn is a pill-shaped blur sitting in the bar.
- The stylesheet's rules are `(0,3,1)`, one step past `liquid-buttons.css`'s
  `.nav-links a:hover`, so they win on weight and load order is free.
- `color` is absent from every rule — `styles.css` keeps the label colour.
- The plate's background is a **copy** of `.header-inner`'s in `styles.css`. It
  is all tokens, so it only needs touching if the *shape* of that gradient
  changes.
- The accent label is still `#35c9ae` at ~2:1 on the light bar. The capsule,
  not the label colour, is what marks the current section. Two attempts at
  fixing the label itself were built and rejected on looks: a darkened accent
  ink (`#1e7162`, 5.55:1, read muddy) and a filled accent pill (8.38:1, too
  heavy).
