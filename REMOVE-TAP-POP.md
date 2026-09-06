# Removing tap-to-open on touch

On a phone every preview panel on the site now opens as a bottom sheet when you
tap the thing it belongs to, and closes with a button, a tap outside, or
Escape. On a pointer nothing changed: the panels still open on hover exactly as
they did.

Six panels are involved:

| panel | trigger | what it was doing on touch before |
| --- | --- | --- |
| four Experience galleries (`.work-link`) | `<a class="work-tile">` → ArtStation | hidden outright; a tap followed the link |
| résumé preview (`.link-pop--resume`) | `<a class="btn btn-secondary" download>` | hidden outright; a tap downloaded the PDF |
| certificates (`.work-link--cert`) | `<button class="work-tile">` | opened, but on sticky `:focus-within` alone — no close button, and it let go only when something else was tapped |

The three college film panels (`.work-link--college`) are **not** part of this
feature. They had their own tap-to-open latch first, in `college-projects.js`,
because a playing cross-origin iframe drops out of `:focus-within` and they have
a video to stop on the way out. Everything here is scoped
`:not(.work-link--college)` so the two never meet, and both use the same
`data-open` attribute on disjoint elements without reading each other's.

## The files

| file | what it holds |
| --- | --- |
| `tap-pop.css` | un-hides the panels under `(hover: none)`, turns them into fixed sheets, cancels sticky hover/focus, styles the close button |
| `tap-pop.js` | the latch: first tap opens, close button / outside tap / Escape close, and the panel's lazy images are forced on open |
| two tags in `index.html` | the stylesheet **last** in `<head>`, the script after `certificates.js` |

Deleting those three restores the previous behaviour exactly: `styles.css`'s
`@media (hover: none) { .link-pop { display: none } }` takes over again, the
Experience and résumé panels go back to being unreachable on a phone, and
certificates falls back to its own `:focus-within` block in section 6 of
`certificates.css`, which was never removed.

**`tap-pop.css` must load last.** Two of its rules — the ones cancelling sticky
`:hover` and `:focus-within` — tie on specificity with what they are overriding
and win on source order alone.

## Three things that are not in those files, and should stay

These were bugs in their own right. Each was found while building this and each
stands on its own; none of them should be reverted with the feature.

### 1. `.reveal.is-visible` ends on `transform: none`, in `styles.css`

It used to end on `transform: translateY(0)`. They paint identically, but an
identity transform is still a transform, and it makes the element a containing
block for every `position: fixed` descendant.

Every panel except the résumé sits inside a `.timeline-item`, which is a
`.reveal`. So a sheet asking for `left/right: 12px` was being framed by the card
instead of the screen — measured at 390px: 294px wide at x=59, with its top
187px *above* the viewport and unreachable. This silently affected the
certificates and college sheets too, which had shipped that way.

The reveal animation is unchanged; a transition from `translateY(8px)` to `none`
interpolates against the identity just the same.

### 2. Section 3b of `tap-pop.css`

`.reveal` also carries `translateY(8px)` *before* the item scrolls into view, and
for the 500ms the reveal is animating. Fix 1 only settles the end state, so a
sheet opened out of a still-revealing card hit the same wall. Section 3b drops
the transform on any `.timeline-item` that actually contains an open panel,
via `:has()`, so the sheet never depends on an ancestor's animation having
finished. It covers the college panels too — the attribute it matches is the one
their own latch sets.

If `tap-pop.css` is deleted, fix 1 still handles the realistic case.

### 3. `college-projects.js` inserts its close button first, not last

It used `panel.appendChild(close)`, while section 5 of `college-projects.css`
makes that button `position: sticky; top: 0`. Sticky can never carry an element
above its own place in the flow, so appended after the footer it stuck to the
**bottom** of the content: measured at 390px, the button sat at y=1421 while the
sheet occupied 174–832. The only way to reach it was to scroll to the end of a
1285px panel with the video still playing.

`tap-pop.js` inserts its own close button first for the same reason.

### 4. The strip stops being a scroll container on touch

In all three of `tap-pop.css`, `college-projects.css` and `certificates.css`,
the touch block sets the strip to `overflow: visible`, not just
`max-height: none`.

`styles.css` gives `.link-pop-strip` `overflow-y: auto` and
`overscroll-behavior: contain`, which is right while the strip is capped at
360px and holds the overflow. Uncapped it is still a scroll container, just one
with nothing to scroll — scrollHeight and clientHeight both 2879. A drag landing
on it, which is most of the sheet, was consumed by a container with no room to
move and chained past the panel that does hold the overflow (2959 against a
744px viewport) straight to the document. Measured: the sheet stayed at
scrollTop 0 while the page behind it moved 2506 → 2932. The sheet looked frozen
and the page slid around underneath it.

The panel takes over the `overscroll-behavior: contain` the strip used to carry,
so the sheet still does not hand its scroll back to the page when it bottoms out.

### 5. The card is raised while it holds a sheet

`.timeline-item` carries `isolation: isolate`, deliberately — the note in
`styles.css` says it replaces the stacking context `backdrop-filter` used to
provide, "which the hover panel's z-index depends on". So a panel's z-index is
scoped inside its own card by design, and what lifts it clear of the next card
on a pointer is `.timeline-item:hover, :focus-within { z-index: 3 }`.

Nothing lifted it on touch. The sheet asks for `z-index: 60`, that 60 is trapped
in the card's context, and two sibling cards at `z-index: auto` then paint in
DOM order — so the card *below* painted over the sheet. Measured with the
Experience sheet open: `elementsFromPoint` at the centre of the sheet returned
the next card's `.timeline-headline` on top, and a drag there scrolled the page
rather than the sheet. Section 3b of `tap-pop.css` gives the card `z-index: 4`
while it holds an open panel — above a sibling that is simultaneously hovered,
and well under the sticky header at 100, which the sheet is never tall enough to
reach.

## Two behaviours worth knowing before changing them

**The second tap.** Once a sheet is open, a second tap on the trigger falls
through — an `<a>` follows its link (ArtStation, or the résumé PDF), so nothing
that used to be one tap away is now lost. The certificates trigger is a
`<button>` with nowhere to go, so for that one the second tap closes instead.
In practice the sheet covers the lower 78% of the screen and usually covers its
own trigger, so this is a fallback for triggers that stay visible above it, not
the main way out. The close button, a tap outside and Escape are.

**Escape is bound in the capture phase.** `script.js` and `certificates.js` each
bind Escape on the group and call `stopPropagation()` when focus is inside it —
which a tapped panel always has. A bubble-phase listener on `document` is never
reached, and Escape did nothing at all. Capturing runs the latch's own exit
first, on the way down. If that `true` is ever dropped, Escape silently stops
working on touch while still looking correct in the source.

## Checking it

Serve on a fresh port (`:5500` caches assets) and drive headless Chrome over
CDP — `(hover: none)` needs real media emulation, which no command-line flag
provides:

```
Emulation.setDeviceMetricsOverride  { width: 390, height: 844, mobile: true }
Emulation.setTouchEmulationEnabled  { enabled: true }
Emulation.setEmulatedMedia          features: hover=none, any-hover=none, pointer=coarse
```

Two things will waste an hour if you forget them. The page sets
`scroll-behavior: smooth`, so `scrollIntoView` is still travelling when you
measure the tap point and the click lands somewhere else — override it to `auto`
in the harness. And a bare `[data-open]` selector also matches the meeting
picker's `.mp` shell, which carries that attribute for its own reasons; scope
any "is a panel open?" check to `.work-link` / `.resume-link`.

An open sheet is anchored to the viewport when its box reads `12,<top>
366x658` at 390px wide. If it reads `59,<top> 294x658`, an ancestor transform
has come back — see fixes 1 and 2.
