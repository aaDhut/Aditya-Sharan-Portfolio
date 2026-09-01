# Removing the text glow

A light that travels down the About paragraph one rendered line at a time as
the page scrolls, at a pace of its own rather than the scrollbar's. A whole
line sits at full brightness while the light is inside it; at each line
boundary the outgoing and incoming lines cross at half brightness. The run ends
on the last line and holds there. Added as a self-contained, reversible
feature: it rewrites the inside of one paragraph and nothing else.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Slide a band of light through the About paragraph on scroll' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm text-glow.css text-glow.js REMOVE-TEXT-GLOW.md
```

**2. Unlink it** in `index.html` — two commented blocks:

```sh
grep -n "\[text-glow\]" index.html
```

That lists two sites: the `<link>` after `call-glass.css` in the head, and the
`<script>` just before `script.js`. Delete each comment along with the tag it
introduces.

That is the entire removal. `styles.css`, `script.js`, `dark-mode.css` and the
paragraph markup in `index.html` were never touched — there is no edit anywhere
to reverse. The paragraph goes back to plain muted text on the next load,
because the split only ever existed in the DOM at runtime, never in the source.

The reverse is also true: delete the About section and leave these files in
place and they do nothing. `text-glow.js` looks for `#about .about-text` on
load and returns if it is not there.

---

## Tuning it instead of removing it

All five knobs are named constants at the top of `text-glow.js`.

**`READ_LPS`** (default `1.4`) — how fast the light is allowed to travel, in
**lines** per second. This is the pace knob. 1.4 crosses this paragraph's seven
lines in about 4.8 seconds, so a line holds the light for roughly two thirds of
a second: 0.44s at full brightness plus a 0.29s cross-fade.

Scroll sets where the light is heading; this caps how quickly it may get there.
The two only disagree when scrolling outruns the cap, which at this setting is
about 85px of scroll per second — below that the light tracks the scrollbar
exactly and the cap may as well not be there, above it the cap governs. Raise
it toward `3` and lines flash past; below about `0.7` the light is slower than
the reader and becomes something to wait for.

Note the unit is lines, not words. A narrow viewport wraps the same paragraph
into more, shorter lines, so the run takes longer on a phone than on a laptop.
That is deliberate — a line is a line, and stepping through 5-word lines at
laptop speed would strobe. If you would rather every screen take the same
wall-clock time, scale `maxRate` by `nLines` in `groupLines`.

**`FADE_LINES`** (default `0.2`) — how the handoff between two lines reads, as
a fraction of one line. A line is at full brightness the *whole* time the light
is inside it; this carves a ramp out of each end, straddling the boundary. At
`0.2` a line is full for 60% of its turn and cross-fading for the other 40%.
`0` is a hard cut with no overlap at all. `0.5` removes the plateau entirely
and the light never settles on a line — which is the thing this version exists
to avoid, so treat it as the ceiling rather than an option.

**`START`** / **`END`** (default `0.69` / `0.42`) — where the light enters and
leaves, as fractions of viewport height. Both were read off the rendered page.
The first line lights when the paragraph's **top** edge reaches 69% of the
viewport: the whole paragraph is just clear of the fold with the hero still
above it. The light arrives on the last line once the paragraph's **bottom**
edge passes 42%, which is About pinned near the top of the screen with the run
visibly complete. Keep `START` above `END`; the code assumes the range is
positive, and a `START` below `END` runs the light backwards.

Do not reach for these to change the pace; that is `READ_LPS`'s job. The span
between them is about 410px on a 820px viewport, so scroll commands the whole
run in half a screen and `READ_LPS` plays it out from there — these two set
*where*, not *how fast*.

**`SELECTOR`** (default `'#about .about-text'`) — which paragraph gets it.
Scoped to the About section deliberately: the contact section reuses
`.about-text`, and lighting a second paragraph the same way spends the effect.
Widening it to `.about-text` catches both. Note the script handles one element
— it uses `querySelector`, not `querySelectorAll`.

Colour and intensity live in `text-glow.css`, in four tokens at the top of the
file. The dim end of the ramp is `--color-text-muted` straight from the
palette. The lit end is `--tg-lit`, deliberately *past* `--color-text` —
`#0a0a0a` in light mode, pure white in dark — so a lit line reads as brighter
than the body copy around it rather than merely un-dimmed. The halo is
`--tg-glow-rgb`, raw space-separated channels rather than a colour token
because it feeds an `rgb(... / alpha)` whose alpha is computed per word; its
two peak alphas are `--tg-glow-a1` and `--tg-glow-a2`, and the blur radii
(`12px` and `26px`) live on `.tg-word`. To dial intensity up or down, move
`--tg-lit` and those alphas together — one without the other reads as either a
flat colour change or a halo with nothing inside it. All four tokens are
declared three times — once for light, once for `prefers-color-scheme: dark`,
once for `[data-theme="dark"]` — mirroring exactly how `dark-mode.css` wires
its own tokens.

The halos are not the same effect in the two themes, which is why the alphas
are tokens rather than one shared pair. On dark, a pale green halo bleeds
colour outward from the letters into a dark ground — that is a glow in the
ordinary sense, and `0.6` / `0.32` is plenty. On light, there is no such move
available: any halo darker than the `#faf9f7` page reads as a sooty smear, not
a light, so the light theme's halo is *white* and works by bleaching the paper
immediately around a lit word. Bleaching an off-white that is already almost
white has very little room to work in, so it is laid on much harder — `0.9` /
`0.55`. If you ever give the light theme a coloured halo again, check it
against the page background first: darker than the ground means a shadow, not
a glow.

## Things worth knowing before you edit it

**The unit is a rendered line, and that is not a thing the source knows
about.** Sentences could be wrapped in spans at split time; lines cannot,
because where a line breaks is a fact about layout that changes with viewport
width, font loading and zoom. So the split is at the **word** level, and
`groupLines()` reads `offsetTop` off every word span and groups the ones that
share a line box. Words on the same line share an `offsetTop` exactly — inline
boxes of the same font sit in the same line box — so the 4px tolerance is only
absorbing sub-pixel noise, not guessing.

That measurement runs inside `measure()`, never on the scroll path. All the
`offsetTop` reads happen back to back with no writes between them, so the
browser does one layout for the batch rather than one per word.

**The re-group triggers matter more than they look.** `index.html` loads the
font stylesheets non-blocking, so the script's first `measure()` runs against
the *fallback* font, which fits a different number of words on a line. Measured
in Chromium before this was handled: one written brightness value covered two
different `offsetTop`s — the light was writing across a stale set of words that
straddled two real lines. `document.fonts.ready` alone does not catch it,
because with a non-blocking stylesheet there may be no pending faces at the
moment it is awaited, so it resolves against the fallback and never fires
again. There are now three triggers, and each covers something the others miss:

- `document.fonts.ready` — the normal case, fonts already pending.
- `document.fonts` `'loadingdone'` — fires when a batch of faces actually
  finishes, which is the swap itself. This is the one that fixes the bug above.
- a `ResizeObserver` on the paragraph — the backstop for a container width
  change, browser zoom, or any late reflow the other two never hear about.
  It cannot feed itself: `measure()` only reads layout and writes inline custom
  properties, and neither colour nor text-shadow changes a box's size.

Plus the `window` resize listener, which the `ResizeObserver` does *not* make
redundant — `scrollStart` depends on `window.innerHeight`, which can change
without the paragraph's own box changing at all.

**Hyphens get their own span.** A hyphen is a line-break opportunity, so
"user-centric" can render as two boxes on two different lines — and `offsetTop`
reports only the first, which would file the whole word under the earlier line
and light "centric" a line early. `fragments()` breaks the span after each
hyphen so every rendered piece has its own element and its own `offsetTop`.
Verified in Chromium: with the split at word boundaries only, `user-centric`
reported 2 client rects; after fragmenting, no span in the paragraph renders
across more than one line. The fragments sit flush with no text between them
and inline boundaries create no break opportunities of their own, so the
paragraph renders and wraps identically — checked against a control page with
the script disabled: same box, to the pixel, at every width tested.

**`measure()` clears every word before regrouping.** After a re-wrap a word can
move to a different line, so a word the old grouping had lit could be stranded
outside the new window and stay bright forever. `measure()` unsets `--tg` on
all of them and resets `prevLo`/`prevHi`, which is why those three variables are
declared above it rather than down in the paint section where they are used.

**The envelope has a flat top with the ramp on the boundary.** Line `L` owns
the interval `[L, L+1]` in line-space. `paint` computes a *signed* distance —
positive outside the line, negative by the depth once inside — and maps it
through a raised cosine over `±FADE_LINES`. Full inside the plateau, zero past
the ramp, and exactly `0.5` when the light sits on a boundary. Because the ramp
straddles the boundary rather than sitting inside either line, the outgoing and
incoming values sum to 1 the whole way across the seam: no dip, and no frame
where two lines are both fully lit. Measuring depth rather than
distance-to-centre is what gives the flat top; go back to distance-to-centre
and the plateau becomes a peak that bulges around the middle word.

**At most two lines are ever non-zero.** The window is `1 + 2·FADE_LINES` wide,
so it holds one line most of the time and two through a handoff. `paint` walks
only `lo..hi`, clears the previous window first, and never touches the rest of
the paragraph — verified by simulation across the whole progress range: max 2
lines above the 0.001 threshold, and no lit line ever falls outside `lo..hi`.

**Scroll sets a target; the light walks to it.** There are two positions in
`text-glow.js`, and the gap between them is the point. `target` is the pure
function of `window.pageYOffset`, clamped to 0..1. `shown` is where the light
actually is, and each frame it steps toward `target` by at most `READ_LPS`
lines' worth of progress. `paint` itself is pure: it renders whatever progress
it is handed and keeps no state between frames beyond the window it must clear.

What survives: **at rest, the picture is a pure function of scroll.** Once the
light has caught up, arriving at a scroll position downward, upward, or by a
cold jump all produce the same lit line. What is gone is frame-by-frame path
independence *during* a scroll. If you need it back, set `READ_LPS` high enough
that the cap never binds; there is no separate switch.

**The loop stops itself.** `requestAnimationFrame` is scheduled only while
`shown !== target`, and the last frame of a run clears the handle. A page
sitting still schedules no frames at all.

**The run ends in the *middle* of the last line, and parks there.** `paint`
maps progress 1 to a position of `nLines - 0.5`, so the light settles on the
final line at full brightness instead of sailing off the end of it. Progress is
clamped to 1, so scrolling further changes nothing. The lead-in survives but
there is no lead-out — the paragraph is dark at the top of the range and lit at
the bottom, not dark at both ends. `maxRate` divides by that same
`nLines - 0.5 + fade` span; **the two must stay in step**, or the light travels
at a pace that does not match its own range.

**The word spans must stay `display: inline`,** and this rule is now
load-bearing twice. Inline box boundaries create no line-break opportunities,
which is the only reason wrapping every word leaves the line wrapping identical
to the unwrapped paragraph — and `groupLines` reads `offsetTop` off those same
spans, so a display change would alter both the wrapping and the meaning of the
measurement. If you want per-word movement, the fix is a wrapping element
inside each `.tg-word`, not a display change on it.

**Verified in Chromium** at 1440 / 1280 / 1220 / 1100 / 900 / 768 / 600 / 430 /
375px: 7 lines on a desktop down to 13 on a phone, exactly one line at full
brightness at any moment with a second only mid-handoff, no span straddling two
lines at any width, and the rendered text identical to the source paragraph.

**There is only one copy of the sentence in the DOM.** An earlier per-letter
version needed a hidden `.tg-a11y` duplicate, because screen readers handed 416
one-letter spans will spell some of them out. Words are plain text inside plain
spans, so the visible copy *is* the accessible copy. Splitting finer than a
word brings that problem — and the duplicate — back.

**Reduced motion skips the split entirely.** `text-glow.js` returns before
touching the DOM if `prefers-reduced-motion: reduce` is set, so the paragraph
stays a plain text node. The matching CSS block exists only to cover a
preference that flips mid-session, when the spans already exist.

**`scrollStart` is clamped at 0 for a reason.** At `START = 0.69` the origin
lands around 160px into the document on a laptop, so the clamp rarely bites —
but a short hero or a very tall viewport can still push it negative, to a
scroll position the page can never reach, and the light would already be
part-way down the paragraph before the reader had scrolled at all.

**Off screen, the light snaps instead of crawling.** `request` checks
visibility against the paragraph bounds cached by `measure` — arithmetic on
`docTop`/`docHeight`, not a second `getBoundingClientRect`, so the scroll
handler still forces no layout — and jumps `shown` to `target` when the
paragraph is fully off screen.

**`dt` is clamped at 100ms.** A backgrounded tab or a long frame delivers one
enormous timestamp gap, and an unclamped step would lurch the light forward by
however many seconds had passed.

**It does not conflict with the scroll reveal in `script.js`.** That fades in
`.about-content`, the wrapper; this lights the lines inside the paragraph.
Different elements, different properties. Both can run on the same scroll.
