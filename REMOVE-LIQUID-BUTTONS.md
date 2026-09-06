# Removing the iOS 26 button material

Every button on the page wears one material: a capsule with a thin translucent
body, a rim that is bright along the top and returns softly along the bottom, a
two-part shadow — a tight contact shadow plus a wide, very soft ambient one —
and one travelling glint that follows the pointer. The three contact buttons
additionally get a real refracting lens with real chromatic aberration.

## The files

| file | what it holds |
| --- | --- |
| `liquid-buttons.css` | the material, dark-mode tokens, the takeover of the three groups that owned their own, the call button's caret, Reduce Transparency, Reduce Motion |
| `liquid-buttons.js` | the lens on `.contact-links .btn` and its hover swell, and the glint driver for every `.btn` |
| two tags in `index.html` | the stylesheet, and the script after `ios-press.js` |

Deleting those three restores the previous look exactly. Nothing in either file
is depended on by anything else, and both are additive: every rule sets
properties another stylesheet already set, and `droplet-buttons.css`,
`call-glass.css` and `meeting-picker.css` are not edited — they are outranked,
so deleting this file hands each of them its own tuning back intact.

## What it took over, and what it left alone

The page had **three** different capsules, which is what this feature exists to
end. Measured in dark mode before the takeover:

| | body | border | rim top / bottom | height |
| --- | --- | --- | --- | --- |
| contact trio | white .06 | white .22 | white .34 / white .10 | 54.3 |
| hero pair | white .07 | white .24 | white .13 / black .35 | 54.3 |
| call pill | white .08 | **transparent** | white .13 / black .35 | **48** |

The call button was the one that showed, and for two reasons worth keeping
written down.

**It drew no rim line at all.** A capsule with `border-color: transparent`
sitting directly under three that draw one does not read as the same material
dimmed — it reads as a flat grey lozenge, because on a surface this thin the
rim *is* the entire cue that it is curved glass rather than paint.

**It was 6px shorter than every other button on the page**, on identical
padding and identical `font-size`. The cause is not in any stylesheet: it is
the only `<button>` among them, Chromium's UA sheet sets `font` on form
controls as a *shorthand*, and a shorthand resets `line-height` to `normal`.
So its label sat in an 18px line box where an `<a>` gets 24.3px.
`meeting-picker.css`'s `font-family: inherit` does not bring it back. The fix
is `line-height: 1.6` on `.btn` in section 1 — the body's own number, stated
rather than inherited because these buttons do not share an ancestor. The
panel's "Next" button had the same 6px and is fixed by the same line.

Section 4a hands the hero pair, the call button and the panel's action button
the tokens at the top of the file. Nothing there is tuned per group: every
value is the one section 1 already uses, and each selector is written exactly
one step more specific than the rule it takes over, so it works from any
position in the load order.

**One difference is deliberately left in place**: the hero pair keep their
painted conic chromatic rim (`.hero-actions .btn::after`). It is the one thing
on the page that is tuned to a specific backdrop rather than to a material —
those two sit over the orb field, which has real colour to disperse — and
removing it makes the hero worse without making anything else match better.
The pair's *material* is now identical to everything else; only that rim is
extra. It is one rule in `droplet-buttons.css` if it ever has to go.

## The glint, and why it is driven twice

`--gx` / `--gy` carry the pointer's position as a 0..1 fraction of the button's
own box; the stylesheet decides what light to make of it. Those names are
**not** prefixed, on purpose: `droplet-buttons.css` and `call-glass.css` had
already registered exactly these two properties, with the same syntax and the
same initial value, so one driver can feed any of the three files and no button
needs to know which one is painting it. Three identical `@property` blocks is
not a conflict, and it is what lets any one of the three files be deleted
without the other two losing their easing.

`liquid-buttons.js` attaches its driver to **every** `.btn`, including the two
that already have one of their own in `droplet-buttons.js` and `call-glass.js`.
That overlap is deliberate redundancy, not an oversight: it is what keeps the
glint alive on a button whose material this file is now painting if either of
those features is later deleted. Two identical writers on one element land the
same value on the same frame, and the second costs one `getBoundingClientRect`
per `pointermove`.

The glint is a **background layer**, not a pseudo-element — `::after` is the
call button's caret and `::before` is the hero pair's chromatic rim, so there
is no pseudo free on every button. The hero pair's own `::before` glint is
emptied (`background: none`) rather than the layer being skipped for them, so
the glint stays defined in exactly one place; their JS keeps writing `--gx` to
a transparent gradient, which is left alone because deleting this file has to
restore that feature working.

Nav links and the burger get the material but **no glint**. A highlight chasing
the pointer inside a 36px nav pill is noise rather than light, and the burger
only exists at a width where there is no pointer to chase.

## The call button's caret

It was a 7px square with two 1.5px borders rotated 45°, which draws a chevron
with mitred corners and square ends. SF Symbols' `chevron.down` — which is what
sits in this exact position in an iOS control — is a stroked path with round
caps and a round join, and at this size that difference is most of what the
glyph is. It is now that path, as a `-webkit-mask` / `mask` over
`background: currentColor`, so it still inherits the label's accent on hover.

Dimmed to 0.6, which is the other iOS convention here: the chevron is a
disclosure hint, not part of the label, and at full strength it competes with
the words for the same attention.

The rotation is 180° exactly, as the old 45°→−135° pair also was. That is worth
keeping: a chevron that returns by a different route reads as two animations
rather than as one control.

Two specificity debts come with taking the caret over, and both are paid in the
file. `meeting-picker.css`'s reduced-motion rule is `.mp-toggle::after` at
(0,1,1) and now loses to section 4b's (0,2,1), so section 8 re-states it —
without that the caret would keep animating under a setting that had already
correctly switched it off. Section 7 lists the three overridden groups at the
weight they were overridden at for the same reason, or they would stay
translucent under Reduce Transparency.

**Load order does not matter for this file**, which is deliberate and worth
keeping. `ios-press.css` declares `transition` on `.btn` and `.nav-links a`,
and this file needs to add `box-shadow` to those lists. Rather than claim a
position in the cascade — three files on this page already claim to load last —
the two rules here are written one step more specific (`.btn.btn-primary`,
`.nav-links li a`) so they win on weight instead. The `transform` entry in them
reads `var(--press-out, <the value inlined>)`, so removing `ios-press` leaves a
button that still springs back rather than snapping.

## Why only three buttons get a lens

Because a lens inside a lens does not work, and it does not fail subtly.

A `backdrop-filter` samples what is behind the element. Put one inside an
element that already has one and it samples the parent's *filtered* output,
through a capture Chromium clips to the child — and for a small child inside a
filtered parent that capture degenerates.

Measured, with a lens on each of the seven nav links inside the already-lensed
header: **every link rendered as a flat opaque grey pill.** Not muddy
refraction — grey paint, no text legibility problem, just no glass at all.

Cost was not the issue and should not be blamed for this later: median frame
was unchanged at 16.6ms with the seven extra lenses running, no frame over
33ms. It is a correctness limit, not a performance one.

`styles.css` states the rule outright at `.link-pop`: *"The material rules at
the top of this file only ever stack one translucent surface."* This is what
that sentence is protecting.

So the buttons divide by what is actually behind them:

| buttons | backdrop | lens |
| --- | --- | --- |
| hero pair | the orb field | already, `droplet-buttons.js` |
| call pill | flat section | already, `call-glass.js` |
| **contact trio** | **flat section** | **added here** |
| nav links, CTA, burger | inside the lensed header | no — grey blob |
| the popup's two buttons | inside the lensed slab | no — grey blob |

The ones that do not get a lens are not missing one. They sit *on* a pane of
real refracting glass, which is how iOS 26 treats a control in a glass toolbar:
a facet of one pane, not a pane of its own.

## What the lens on the contact trio is actually worth

Less than you would hope, and this is worth knowing before spending time
tuning it.

Those three sit on a flat, near-white section. `call-glass.js` already wrote
down why that matters, for the pill directly below them: *"a flat backdrop
looks the same however hard it is bent — the rim and the label are what sell
the glass here."* Screenshotting the section with the feature on and off, the
two are very nearly identical.

That is not a bug and it is not an argument for removing it. It is real glass
and it costs three elements; it will show whenever there is something behind it
to show — in dark mode, over any future background, and against the section's
own edges — and it makes the trio match the lensed pill they sit above, which
they previously did not.

But **the visible half of this feature is the material, not the lens.** If the
buttons ever need to look more like glass than they do, the answer is not a
bigger `scale`; it is putting them somewhere with something behind them.

Where refraction genuinely earns its keep on this page is the header crossing
the college project artwork — the red and pink of the thumbnails smear and
split through its bottom rim. That is the same `glass.js`, doing the same
thing, over content that has something to bend.

## Chromatic aberration is real, and is never faked

Wherever a lens exists, the fringe comes from `glass.js` running three
displacement passes over one map, each channel at a different scale —
confirmed on the contact buttons at 22.1 / 26 / 29.9. It appears only where
the surface actually curves, because the map is neutral across the flat
centre, and it moves when the backdrop moves.

It is deliberately **not** approximated anywhere else. `call-glass.css` shipped
a painted conic gradient masked to a 1px ring standing in for dispersion and
then pulled it out again, because it *"read as exactly that: a rainbow line
drawn around the button."* Do not add one to the nav links to compensate for
their not having a lens — that is the exact mistake that was already made and
reverted once.

## The numbers, and the ceiling above them

`band: 22, scale: 26, dispersion: 0.15, blur: 0.5, saturate: 1.9` — taken from
the call pill in `call-glass.js` rather than invented. Same size, same flat
section, a few centimetres apart on screen.

That file documents a ceiling worth not re-discovering: a displacement larger
than the band it is spread over sends the rim sampling outside Chromium's
element-clipped backdrop capture, and each channel runs off it at a different
offset — which paints a saturated rainbow smear along the bottom edge and
around the ends. Raising `scale` toward the header's 130 on a capsule a third
of its height is how you get there.

The hover swell multiplies displacement by 1.35, against the hero buttons'
1.5. Gentler on purpose, for the same flat-backdrop reason: a harder bend over
a flat section has nothing extra to reveal.

## Three things the file does that are not obvious

### `data-lens`, not a class on everything

`liquid-buttons.js` sets `data-lens` only after `liquidGlass()` reports
`supported: true`. Chromium is currently the only engine that runs an SVG
filter inside `backdrop-filter`; Safari and Firefox get a plain frost. The
attribute selects a thinner tint, and thinning the body of a button that has no
refraction underneath it just makes a washed-out button.

`backdrop-filter` itself is never set in the CSS for those three — `glass.js`
writes it inline, which outranks any stylesheet.

### Hover does not colour the border

`styles.css` turns the border accent-coloured on `:hover`. A flat coloured line
drawn around a refracting surface is the single most reliable way to kill the
illusion, and `droplet-buttons.css` already reached that conclusion for the
hero pair and says so. This generalises it: the rim stays neutral and brightens,
the shadow lifts, and the *label* takes the accent so the hover is not silent.

### Reduce Transparency is honoured

`prefers-reduced-transparency: reduce` turns the material opaque and drops the
rim — a specular highlight on something no longer translucent is just a white
line — and `liquid-buttons.js` returns early without building any lens at all,
because refraction behind an opaque surface is invisible work.

## Checking it

Serve on a fresh port (`:5500` caches assets) and drive headless Chrome. Force
light mode: headless defaults to `prefers-color-scheme: dark`, and this page
has a full dark theme, so screenshots come back as a black bar otherwise.

Two traps cost an hour here and are not specific to this feature:

**`Page.captureScreenshot`'s `clip` is in DOCUMENT coordinates, not viewport
ones.** Screenshotting `{x: 0, y: 0}` after scrolling to 1500 captures the top
of the page, not what is on screen — a blank strip that looks exactly like a
feature that failed to load. Add `window.scrollY` to the rect's `top`.

**`deviceScaleFactor` and `clip.scale` multiply.** Both at 2 gives a 4x image,
and a clip sized in CSS pixels then captures a quarter of what was intended.

The feature is working when all three `.contact-links .btn` carry
`data-lens="on"` and an inline `backdrop-filter` starting `url(#droplet-`, the
last `<filter id="droplet-*">` in the document holds three `feDisplacementMap`
nodes at three different scales, and a contact button's computed `box-shadow`
has four layers: two `inset` rim layers, then `0 1px 2px` and
`0 8px 20px -12px`.

The takeover is working when **all four** of a contact button, the call button,
a hero button and the panel's "Next" agree on every one of these — the point of
the feature is that this table has one row's worth of values in it:

| | dark | light |
| --- | --- | --- |
| `border-color` | `rgba(255,255,255,.22)` | `rgba(255,255,255,.55)` |
| rim | `.34` inset top / `.10` inset bottom | `.92` / `.30` |
| shadow | `0 1px 2px` + `0 8px 20px -12px` | same |
| `height` | `54.3203px` | same |

`height` is the one to check first if something looks off, because it is the
one that changes silently: any new `<button class="btn">` added to the page
comes in at 48px until section 1's `line-height` reaches it.

Hover has to be **driven** — a plain screenshot cannot photograph it. With CDP,
`Input.dispatchMouseEvent` `mouseMoved` onto the button, then read back
`--gx` / `--gy` (they should be the pointer's position as a 0..1 fraction, not
the `0.5` / `0.12` home values), `--lb-glow-a` (`100%`), and `transform`
(`matrix(1.025, …)`). Doing this on both a contact button and the call button
is what proves the shared driver is live on a button that also has one of its
own.

The caret is right when its computed `::after` is `12px` square with
`border-width: 0`, `opacity: 0.6`, a `mask-image` starting
`url("data:image/svg+xml,` — and `matrix(-1, 0, 0, -1, 0, 0)` once
`aria-expanded="true"`. A `border-width` above zero there means section 4b lost
to `meeting-picker.css` and both glyphs are drawing at once.
