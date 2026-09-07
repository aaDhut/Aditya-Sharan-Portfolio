# Removing the nav morph

The nav had seven capsules and no travelling indicator. Each link painted its
own, and when the scroll spy moved `.is-active` from one to the next,
`styles.css` crossfaded them — capsule A faded out over `0.18s` while capsule B
faded in. Nothing moved between them. This replaces all seven with one capsule
that travels on springs.

Added as a self-contained, reversible feature: three new files and two
`<link>`/`<script>` tags. It injects its own elements and one `<svg><defs>`
block for the goo filter, so `index.html` carries no markup for it.

**It ships without `nav-glass`.** That feature was built alongside this one and
rejected — it put a frost layer under the bar and the bar stopped reading as
light and barely-there. Nothing here needs it: every token this file takes from
`nav-glass.css` is written with a fallback, and the pill carries no
`backdrop-filter` of its own, so it is not a nested lens and never becomes the
grey slab `nav-glass` existed to avoid. The pill is a tint, a rim, a cast
shadow and the goo layer. **The bar's own material is untouched** — `styles.css`
and the lens `script.js` puts on `.header-inner` are exactly what they were.
If `nav-glass` is ever installed again, its handoff hands this pill the real
displacement lens and `.nav-morph-pill[data-lens]` thins the fill for it.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Give the nav one capsule that travels' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm nav-morph.css nav-morph.js REMOVE-NAV-MORPH.md
```

**2. Remove the two tags from `index.html`.** Both are tagged `[nav-morph]` —
the stylesheet is the last one in the `<head>`, the script is the second-to-last
one before `</body>`, immediately above `nav-glass.js`. Delete each comment
block with its tag.

```sh
grep -n 'nav-morph' index.html
```

**3. Only if `nav-glass` is installed, remove the handoff from
`nav-glass.js`.** It is not installed as shipped, so normally there is nothing
to do here. If it is, delete the block marked `---- [nav-morph] handoff ----`
in section 2, and the paragraph in the file header that begins "Step 2 has one
fork in it." Both are tagged `[nav-morph]`.

```sh
grep -n 'nav-morph\|morphPill\|morphLens' nav-glass.js
```

`grep -rn 'nav-morph'` should then come back empty. No file that ships is
edited by this feature, so there is nothing else to put back.

**Nothing else references it.** `script.js` is untouched — its scroll spy still
owns `.is-active` and never learned this file existed; the pill watches that
class with a `MutationObserver` rather than being told about it. `styles.css`
is untouched, so the seven per-item capsules and their crossfade come straight
back. `nav-glass.js` returns to lensing the seven pills, which is what the code
below the deleted handoff already does.

## Leaving it in but turning it off

The whole feature is desktop-only and gated on one attribute. To disable it
without deleting anything, make `nav-morph.js` return early — the attribute is
never set, the stylesheet's rules never match, and the page is exactly what it
was.

## Why the seven capsules had to go

They could not travel. Two capsules dissolving into each other across a gap is
a light switch, not an object — and an object is what the bar has been
pretending to hold since the pills got a real lens. One indicator can travel;
seven can only take turns being visible.

The same logic decided hover. There is now one capsule in the bar, so hovering
an item *borrows* it — it flies there and flies back to your current section on
leave — rather than lighting a second one. That is the segmented-control model,
and it is also what makes the motion visible at all: most visitors hover the
nav long before they scroll far enough to move it.

## The goo, and the constraint it had to get around

The blob visibly tearing away and re-merging is an SVG `feGaussianBlur` feeding
an alpha crank. The constraint is real and worth stating plainly: **an element
carrying an SVG `filter` cannot also carry `backdrop-filter`.** The goo and the
displacement lens can never share a box.

They do not have to share one. The goo lives on `.nav-morph-goo`, a layer of
its own *behind* the pill, carrying the filter and no backdrop; the pill
carries the backdrop and no filter. Stacked, they read as one liquid object
with a glass core — and because the pill's lens samples whatever is behind it,
the glass now refracts the liquid it is travelling through.

Three elements make the metaball:

| | what it does |
|---|---|
| **body** | a core *inside* the pill, tracking its sprung geometry |
| **tail** | holds its ground at the origin and collapses in place |
| **neck** | spans the two centres and thins until the filter drops it |

The neck pinches out first (60% of the way), which is what leaves a detached
blob behind to collapse on its own — that ordering is the whole effect. Both
cutoffs are measured against flight *progress*, not the clock, so a hop between
neighbours and a hop across the bar pinch at the same point in the journey.

### Two things that are calibrated, not chosen

**The blur radius and the threshold are one setting.** At `stdDeviation` 9
against a 29px tail, the blur spread the mass so thin that its own peak alpha
fell below the cutoff — and the crank cannot tell a faint blob from a faint
edge, so it erased both. Measured: tail and neck rendered *nothing*, only the
body survived. It is 6 against a threshold of 0.35, which leaves every blob
comfortably above the line while still merging them across a gap.

**The blob fill is not a brightness knob.** The filter multiplies alpha by 20
and subtracts 7, so anything below 0.35 is wiped out and anything above it
saturates solid. The fill is opaque and stays opaque. What to turn if the
liquid is too strong or too weak is `--nm-goo-peak` in `nav-morph.css` — it is
applied *after* the threshold, so it is free to be any value at all.

**The body core is smaller than the pill on purpose.** At full size the white
mass reached the pill's own rim and washed it out — and a solid white backdrop
is also the one thing that leaves the lens nothing to refract. Kept to a core,
it anchors the neck at mid-height and leaves the top and bottom hairlines over
clear backdrop, where they still read as glass.

The layer carries its filter only while something is in flight. A filtered
layer repaints every frame it changes, and there is no reason to hand the
compositor one to maintain over a capsule that is sitting still.

## Why the springs are shaped the way they are

**Two edge springs, not one position spring.** The left and right edges are
integrated separately and the *leading* edge is the stiff one. Moving right,
the right edge leaves first and the left edge drags: the capsule elongates in
flight and contracts as the trailer catches up. Nothing computes a "stretch" —
that shape is what two springs of different stiffness do. Measured on the
longest hop in the bar, the pill reaches 1.61× its resting width about 80ms in,
then squeezes ~3px narrower than the target on arrival before relaxing out.

**A real spring, not a CSS transition.** Scroll quickly through two sections
and the pill has to change destination mid-flight *carrying the velocity it
already has*. A CSS transition restarts from a standstill on every retarget,
which is exactly the dead, re-triggered feel this exists to remove.

**FLIP, not animated `width`.** Animating `left`/`width` is a layout pass per
frame on an element inside the sticky bar. Instead the box is parked at the
destination on every retarget and the transform is the inverse that pulls it
back onto where it currently is; the spring runs that inverse to identity.
Everything per frame is one transform and two custom properties — and the pill
lands *pixel-exact*, because identity is the target rather than wherever an
interpolator happened to stop.

**Squash is a spring too, not a low-pass.** A low-pass can only ease back to
round, and easing back to round is what a firm object does — jelly overshoots.
It is the softest spring in the file (ζ≈0.5) so it crosses zero and stands
*taller* than its target for a moment before settling. Measured on a long hop:
down to 0.864 of resting height, then back up through 1.031. That single
rebound is most of the difference between "springy" and "jelly".

**The trail is not a third spring.** It was, at first, and it was wrong. A
damped spring chasing a fast target settles at a lag of `c·v/k`, and across the
widest hop the body peaks near 2000px/s — so a spring slack enough to visibly
trail sat 270px behind, pinned against its own clamp for thirty straight
frames. Stiffening it to lag ~25px pushes `ω·dt` past 2, where explicit Euler
stops integrating and starts exploding. A trail is not an object being pulled
along; it is *where the body was a moment ago*, so it is defined that way:
velocity times a fixed slice of time, low-passed.

## Two traps worth keeping written down

**The `<li>` steals `offsetParent`.** The stylesheet has to position each list
item so the labels stack above the pill — and a positioned `<li>` becomes its
own anchor's `offsetParent`, so `a.offsetLeft` resolves against the item that
wraps it and reads **0 for every link in the bar**. That is how the first
version measured: all seven at `offsetLeft=0`, and the pill parked on the logo.
Geometry is read from `getBoundingClientRect()` differenced against the list
instead, which nothing in the middle of the tree can reinterpret — and which is
fractional, where `offsetLeft` is not.

**A leave has to be deferred.** In a row of capsules a `mouseleave` is nearly
always followed within a frame or two by a `mouseenter` on the neighbour — the
DOM fires them in that order — so acting on the leave immediately asks a
question the pointer is about to answer. Acting on it immediately produced two
distinct bugs: on the hero, where no section is current yet, sliding from About
to Education ran `hide()` on the leave and then popped a *fresh* capsule at
Education — two static states instead of a journey; and further down, with a
section current, the leave launched a flight back toward that section which the
next enter reversed a few frames later, a visible backwards jerk. A 70ms grace
window collapses both into one continuous flight.

**A hide must not freeze the flight.** `hide()` used to call `stop()`, which
cancels the spring wherever it had got to — and the fade it starts runs for
0.16s. So a hide that interrupted a flight left a stretched capsule sitting in
the gap between two labels, attached to nothing, dissolving in mid-air. It is
easy to hit: scroll up off the first section and the spy drops `.is-active`
while the pill is still crossing the bar. Measured scrolling to the top of the
hero, the pill was left at `scale(1.2171, 0.9669)`, 22.1px from the nearest
link box, and stayed there — so that was also the geometry anything reading the
element next would find. It now keeps springing while it fades and lands on its
own; `frame()` stops itself a few frames later. Snapping it onto the target
with `settle()` fixes the leftover geometry too, but trades the ghost for a
jump.

**`update()` has to check the invariant, not trust it.** When the wanted item
is the one already in `targetIdx`, neither `popTo` nor `flyTo` runs — which is
correct, and is also the one case a pill left stranded by a dropped frame can
never recover from, because every later `update()` reads the same equality and
does nothing. `resume()` compares the live edges against the target's and
restarts the spring if they disagree. At rest they are exactly equal —
`settle()` writes both off the same rect — so on the common path it costs two
subtractions and starts nothing.

**The breakpoint has to be a real gate in both files.** Below 720px
`styles.css` turns the list into a fixed dropdown and the items stack. The
script bails there *before* setting its attribute, and every rule in the
stylesheet sits inside `@media (min-width: 721px)`. If only one of the two did
it, the dropdown would suppress its per-item capsules and then have no
indicator at all.

**The link's `transition` list has to carry `transform` along.** The rule that
fades the label halo on the capsule's clock is `.nav .nav-links[data-nav-morph]
a` at (0,4,1), and it replaces `ios-press.css`'s `.nav-links a` at (0,1,1)
outright — a `transition` shorthand does not merge. Written without a
`transform` entry it silently takes the press's release curve with it, and a
nav pill pressed with a finger snaps back off the squash instead of overshooting
home. The entry is carried over verbatim and tagged `[ios-press]`.

## Measured, on the hop from Education to Testimonials

Real Chrome over CDP, a real pointer move, sampled every frame — 74 frames, no
gap past 17.2ms:

| | |
|---|---|
| peak width in flight | **1.87×** resting |
| height at its flattest | **0.874×** resting (squash) |
| height at the rebound | **1.027×** resting (the overshoot past round) |
| trail alpha at peak | 0.500 |
| goo layer opacity at peak | 0.296 |
| where it landed | `x=1009.00 w=126.80` against a target of `x=1009.03 w=126.81` |

Retargets: exactly one `mouseleave` and one `mouseenter`, 0ms apart — the grace
window collapsed them into one flight, which is what it is there for.

## What it looks like when it is working

- At the top of the page nothing is current, so there is no capsule. Scroll
  into About and it **pops** — out of a third of its width, flattened, over
  ~330ms, overshooting its final width by about 1.5% before settling.
- Hover any item and the capsule flies to it. Leave, and it flies back to your
  section.
- Click one and it squashes first, then flies **straight** to the destination
  rather than visiting every section the smooth scroll crosses on the way.
- On any flight, a blob tears away from where the capsule left, stretches a
  neck behind it, **pinches**, and the orphan shrinks away — roughly 215ms of
  liquid, gone by the time the capsule lands.
- It lands with a **wobble**: squashed on arrival, rebounding a little taller
  than round, then settling.
- It never leaves a gap: at rest the capsule frames its label exactly, on the
  same subpixel, and is indistinguishable from the seven it replaced.
