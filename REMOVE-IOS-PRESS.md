# Removing the squash press

Every tappable thing on the site now presses in three beats: it **squashes**
under the press — wider and shorter, not smaller — springs back through round
and past it into a **stretch**, then **settles** through a decaying wobble to
rest. Nothing else about any control changed: nothing here calls
`preventDefault`, every pointer listener is passive, and the only thing written
to the DOM is two attributes.

## What it replaced

Five press behaviours, and a lot of nothing:

| surface | before | after |
| --- | --- | --- |
| `.btn` (résumé, popup actions) | `scale(0.97)`, 0.15s `ease` **both** ways | capsule |
| hero `.btn` (droplet-buttons.css) | `scale(1.06, 0.9)` squash, one bounce back | capsule |
| `.mp-toggle`, `.mp-actions .btn` (call-glass.css) | same droplet squash | capsule |
| `.work-tile` | `scale(0.98)` on a 0.32s curve | surface |
| `.link-pop-play` | `scale(0.985)` | capsule |
| nav links, nav CTA, burger, close buttons, gallery thumbnails, certificate scans, timeline logos, back links, wordmark, skip link | nothing at all | per tier |

The old `.btn` press used **one curve in both directions**, which is what made
it read as a hover rather than a push. droplet-buttons.css had the right idea
on two buttons already — squash in fast, overshoot back — and this generalises
it to the whole page and adds the third beat it never had.

| tier | squash | who |
| --- | --- | --- |
| capsule | `scale(1.05, 0.93)` | buttons, nav pills, timeline company names, burger, play and close |
| surface | `scale(1.018, 0.974)` | gallery tiles, certificate scans, timeline logos |
| text | `opacity: 0.6` | back links, the wordmark, the skip link |

`.timeline-company a` — the company name beside each timeline logo — was added
after the fact. It was the last tappable thing on the page with no press at
all, and the miss was easy to see once pointed at: the logo tile immediately to
its left is in the surface tier and goes to the *same* LinkedIn page, so
pressing the mark did something and pressing the name did nothing. It is the
same capsule as a nav pill (bare until pointed at, then a chip materialises),
so it takes the capsule depth, and it is declared at (0,1,1) for exactly the
reason `.nav-links a` is — see section 1 of the CSS.

An audit is cheap and worth re-running after adding any control: walk
`a[href], button, [role=button], summary, input[type=submit]` and check each
against the `SELECTOR` in `ios-press.js` (read it out of the file rather than
retyping it — a stale copy in the audit reports a covered element as missing,
which cost a round trip here). At the time of writing that returns 29 kinds
covered and zero uncovered.

## The files

| file | what it holds |
| --- | --- |
| `ios-press.css` | the tiers, the squash, the settle keyframes, reduced motion |
| `ios-press.js` | the latch: press on finger-down, track it, decide how it ends |
| two tags in `index.html` | the stylesheet **last** in `<head>`, the script after `tap-pop.js` |

Deleting those three restores the previous behaviour exactly. Every rule this
feature took over is still sitting in its original file, untouched — the
droplet squash comes back on the hero buttons and the call pill, `.btn` goes
back to its symmetric 0.15s, and half the page stops pressing again.

**`ios-press.css` must load last.** Six of its selectors are written in a shape
they would not otherwise need — `.hero-actions .btn`, the two
`.mp[data-glass='on']` forms, `.work-link .work-tile` — purely so they tie the
`:active` rules in droplet-buttons.css, call-glass.css and styles.css on
specificity and win on source order. Written shorter, or loaded earlier, they
lose and the old presses are silently still running.

It loads *after* `tap-pop.css`, whose own header asks to be last. That is safe
and was checked: tap-pop owns `opacity` and `visibility` on `.link-pop`, this
file owns `transform` and `opacity` on the controls, and the two sets do not
intersect. If a third file ever needs to be last, this one and tap-pop both
have to be re-read before it goes in.

## Tuning it

The whole effect comes off two numbers per tier, in section 1 of the CSS:

```
--press-dx   how far it spreads
--press-dy   how far it flattens
```

Everything downstream is written in terms of those — the pressed state and all
five stops of the settle — so a tier retunes from one pair and stays in
proportion. Raise `--press-dy` for a deeper press, raise `--press-dx` for a
wider spread, set them equal for a volume-preserving squash. They are
deliberately *not* equal: X grows by less than Y loses, so a press reads as
being pushed down into the page rather than as inflating.

`--press-settle` is how long the wobble takes to die out. The latch reads that
same value at load rather than repeating it, so changing it here cannot leave
the script behind and cut the animation off mid-swing.

## Why the follow-through needs JS, and a keyframe

A CSS transition goes from one value to another and can overshoot the end
exactly once — which is a bounce, not a settle. `cubic-bezier(…, 1.25)` on the
release from a squash does give you the stretch for free, and that is what
droplet-buttons.css has always done, but it stops there. A settle is a decaying
oscillation: squash, stretch, smaller squash, smaller stretch, rest. That needs
keyframes.

And keyframes need a trigger. The settle is a reaction to the press **ending**,
and CSS has no selector for a state being left — `:not([data-pressed])` matches
every button on the page that has never been touched, so the animation would
run on all of them at load. So `ios-press.js` sets `data-released` for exactly
as long as the settle runs and takes it off again.

Two consequences worth knowing before editing either file:

- **A running animation outranks every normal declaration in the cascade.** The
  section 3 selectors therefore need no specificity work, unlike section 2. It
  is also why the latch must clear `data-released` the instant a new press
  starts — left on, the settle would keep animating straight through the squash
  the new press is asking for.
- **`data-released` comes off on a timer, not only on `animationend`.** There
  are three ways the animation never fires one: `prefers-reduced-motion` turns
  it off, a control that goes `display: none` mid-press never starts it, and
  `ios-press.css` may have been deleted. `animationend` is the fast path; the
  timer is the one that cannot fail to clean up.

## Not every release earns the bounce

This is the part most likely to get flattened by a later edit, so it is worth
stating plainly. The latch distinguishes two ways out:

- **A completed press** — finger up *on* the control, or a key released — runs
  the full settle.
- **A cancelled press** — the finger slid off, the finger came up outside the
  control, the browser took the pointer for a scroll, the window lost focus —
  just relaxes back on the transition curve with no follow-through at all.

Nothing happened, so nothing should celebrate. A button bouncing under a thumb
that is busy scrolling past it reads as a glitch, and a press that ends outside
the control does not fire its click either, so it must not act as though it
did. iOS drops its highlight the same way.

**The scroll cancel is not written anywhere.** When a touch that started on a
button turns into a page scroll, the browser takes the pointer over and fires
`pointercancel`, which is already one of the ways out. This is also why nothing
sets `touch-action` — the moment it did, the browser would stop reporting the
scroll and the press would stick to a finger that has long since moved on.

## Five decisions that look arbitrary and are not

### 1. Text does not squash

A run of type that changes width mid-press does not read as a button being
pressed, it reads as a font failing to load. `.mp-back`, `.logo` and
`.skip-link` keep the dim they had. Opacity also gets its own release curve,
`--press-out-fade`: `--press-out` ends on 1.25, and an overshoot on opacity has
nowhere to go — the value clamps at 1 and the last of the fade is spent sitting
still. A body can overshoot its size; a fade cannot overshoot being opaque.

### 2. The surface tier is about a third of the depth

A photograph distorts far more visibly than a capsule does. The same numbers
that read as a squashy button on a pill read as a warped image on a certificate
scan. It still lands, because the eye is reading the timing more than the
distance.

### 3. No `box-shadow`, and no `filter: brightness()`

Both are the obvious way to make glass gel under a press, and both are
deliberately absent. Three files build careful shadow stacks on these buttons —
droplet-buttons.css alone stacks a rim, a surface shadow and a tight contact
shadow — and re-declaring one would flatten the other two.

`filter` is worse than untidy: it makes an element a containing block for every
`position: fixed` descendant, which is the exact trap REMOVE-TAP-POP.md
documents and fixed twice. A brightness filter on a `.work-tile` would be
harmless, but the same rule reaching a panel or a card would tear the touch
sheets off the viewport again. The press is `transform` and `opacity` only.

### 4. `ease-in-out`, and one keyframe that overrides it

The animation-level timing function applies between each **pair** of keyframes,
not across the whole animation, so `ease-in-out` makes every swing ease out of
one extreme and into the next — which is what makes the settle read as a sine
rather than as the triangle wave that linear interpolation between the same
stops would give. The `0%` stop overrides it with a fast-out curve: leaving the
squash is a release, and a release is fastest at the instant it happens.

The amplitudes — 1, then 0.6, 0.28, 0.12, 0.05 — are each a bit under half the
last, which is roughly what a real damped spring does. Measured on a hero
button, the peaks come out at 0.030 → 0.014 → 0.006 → 0.0025. An even decay
reads as a wobble; too steep and the follow-through is gone by the second beat.

### 5. `.mp-item` presses nothing

The meeting picker's day and time rows are a scrolling wheel. The whole gesture
there is a drag, so a press state would flash on every spin, and iOS wheel rows
do not highlight either. They are excluded from both files.

### 6. The slop is 32px

A press survives the pointer wandering 32px outside the control before it lets
go. A thumb rolls on the way down, and a press that flickers off under a 2px
tremor reads as a broken button rather than a precise one.

### 7. Reduced motion drops the settle entirely

The squash goes, the settle goes, and an opacity dip replaces both. A decaying
oscillation is the single most motion in the feature and there is no gentle
version of it worth keeping. But a press is a confirmation that the tap landed,
and removing it outright is worse for someone who asked for less motion than
the dim that stands in for it — Reduce Motion on iOS keeps its button
highlights for the same reason.

## One behaviour worth knowing before changing it

**On a mouse, dragging off a button does not re-arm when you drag back.** That
is not a bug in the latch. Chrome starts a native HTML5 drag when you pull the
pointer off a link or a button with the button held, and fires `pointercancel`
when it does — the browser saying the pointer is no longer yours. The latch
honours that and lets go for good, which is also what macOS does. On touch,
where no native drag starts, off-and-back-on works and is tested.

## Checking it

Serve on a fresh port (`:5500` caches assets) and drive headless Chrome over
CDP. `(hover: none)` needs real media emulation, which no command-line flag
provides:

```
Emulation.setDeviceMetricsOverride  { width: 390, height: 844, mobile: true }
Emulation.setTouchEmulationEnabled  { enabled: true }
Emulation.setEmulatedMedia          features: hover=none, any-hover=none, pointer=coarse
```

Five things will waste an hour if you forget them.

**Set `data-pressed`, then wait before measuring.** `getComputedStyle` returns
the *animated* value, so reading it in the same statement that sets the
attribute returns the start of the 0.12s transition — `matrix(1, 0, 0, 1, 0, 0)`
— and every tier looks broken while being perfectly correct. Wait 300ms.

**Sample the settle for its whole length.** It is `--press-settle` long, 540ms,
which is about 33 frames. Stopping at 26 catches it at 0.997 and reads as a
settle that never lands.

**Half these controls are `display: none` on a desktop viewport.** `.nav-toggle`
is the mobile burger and `.link-pop-close` only exists while a sheet is open, so
both report `transform: none` at 1280px no matter what the CSS says. Measure
them at 390px, with the sheet actually open.

**Do not clone a control out of its context to inspect it.** `.nav-links a`
carries both the capsule styling and the depth tokens, so a `.nav-cta` cloned
anywhere else has no `--press-dx` at all, `scale(calc(1 + var(--press-dx)), …)`
is then invalid, and the transform computes to `none`. Build a bare
`<a class="btn btn-primary">` instead — it takes its tokens from the unscoped
`.btn` rule.

**Let the reveal observer settle before opening a sheet.** `scrollIntoView`
followed by an immediate `click()` opens the panel out of a card that is still
at `translateY(8px)`, and the sheet gets framed by the card — 288px wide at
x=65 instead of 366 at x=12. That is the pre-existing symptom REMOVE-TAP-POP.md
describes, reachable only from a script that outruns the observer, and it is not
caused by anything here. Wait ~900ms after scrolling.

A press is correct when the control is measurably **wider and shorter** at
300ms, the release passes through a point where it is narrower and taller than
rest, the X scale reverses direction at least twice, and it lands on exactly
`1.000 × 1.000` before `data-released` comes off.

To see the shape without a video, freeze it: give the control `data-released`
plus `animation-play-state: paused` and a negative `animation-delay`, and each
offset renders as a still.
