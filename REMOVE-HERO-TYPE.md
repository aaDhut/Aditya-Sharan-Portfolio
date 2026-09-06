# Removing the hero typewriter

The hero headline and tagline type themselves in on arrival. Each character
flashes as it lands and settles to a soft accent glow, a shimmer sweeps across
the headline once it is whole, and two phrases in the tagline are punctuated by
a short burst of emoji that fly in, arc outward and fade: 🎨 🖌️ on *concept*,
and 📦 💼 🤝 on *AI product management*.

Added as a self-contained, reversible feature. It rewrites the inside of two
elements at runtime and injects one effects layer; nothing else on the page is
touched.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Type the hero headline and tagline in on arrival' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm hero-type.css hero-type.js REMOVE-HERO-TYPE.md
```

**2. Unlink it** in `index.html` — two commented blocks:

```sh
grep -n "\[hero-type\]" index.html
```

That lists two sites: the `<link>` after `ios-press.css` at the end of the head,
and the `<script>` after `liquid-buttons.js` at the end of the body. Delete each
comment along with the tag it introduces.

That is the entire removal. `styles.css`, `dark-mode.css`, `script.js` and the
hero markup in `index.html` were never touched — there is no edit anywhere to
reverse. The hero goes back to plain static text on the next load, because the
per-character split only ever existed in the DOM at runtime, never in the
source. Deleting the files alone is also safe: with the script gone every rule
in `hero-type.css` matches nothing, since every selector it uses is a class the
script creates.

The reverse is also true. Rewrite the hero copy, or drop `.hero h1` or
`.hero-tagline` entirely, and `hero-type.js` returns without doing anything —
it requires both elements before it touches either. A phrase in `BURSTS` that
no longer appears in the copy is skipped in silence.

---

## What it does to the DOM

`.hero h1` and `.hero-tagline` are rebuilt as one `<span class="ht-w">` per
word, each holding one `<span class="ht-c">` per character, with the original
spaces left as plain text nodes between the words. The text content is
unchanged, so this is invisible to screen readers and to search engines, both
of which see the finished sentence however far along the typing is.

It also appends one `<div class="hero-fx" aria-hidden="true">` to `.hero` for
the emoji to live in. It is `pointer-events: none` and empty except during a
burst — each emoji removes itself when its animation finishes.

### Why it never shifts the layout

Untyped characters are hidden with `opacity: 0`, never `display: none`. Every
glyph occupies its final box from the first frame, so the browser wraps the
complete sentence once, at load, and typing only changes what is painted inside
boxes that never move.

This is also why the word wrapper uses `white-space: nowrap` rather than
`display: inline-block`. It needs to stop a word breaking between its own
characters, which are now separate inline boxes — but `inline-block` would make
each word an atomic box, which disables kerning across the word and changes how
`text-wrap: balance` distributes the headline's lines. `nowrap` buys the
guarantee on its own and leaves the inline layout model alone.

Verified: rendering the finished text against `main` at 1440×900, the ink is
identical row for row, with every line's left edge on the same pixel.

## When it runs, and when it waits

**`prefers-reduced-motion: reduce`** is the only setting that skips the effect
outright: every character is visible immediately, with no typing, no bursts and
no sweep. The resting glow stays — it does not move, so it is not motion, and
dropping it would make the two settings render meaningfully different pages
rather than the same page at two intensities.

Otherwise the typing is held by an `IntersectionObserver` on the headline and
starts the first time it is at least 85% on screen. Load at the top and that is
immediately. Land on `/#about` and it waits; scroll back up later and the
headline types itself then, while you are looking at it. It runs once either
way.

That is worth stating plainly because two more obvious versions of this check
were both wrong, and both were briefly live in this file:

- **Measuring the hero once at load.** A deferred script runs as soon as
  parsing ends, and the browser does not scroll to a fragment until after that.
  On `/#about` the hero measures as perfectly in view at the exact moment the
  decision is made, and then the page jumps away from it.
- **Reading `location.hash` instead.** This does answer that question, but it
  answers a different one than the one that matters. Following any nav link
  leaves a hash in the address bar, so a reload from anywhere on the site
  carries one — and the animation was then suppressed on nearly every reload.
  That is not "nobody was going to see it", that is just gone.

An observer sidesteps the timing problem by not caring when the scroll settles,
and turns the deep-link case into something better than a skip.

If `IntersectionObserver` is missing, the typing starts immediately rather than
never.

---

## The motion

The whole effect is built to Apple's product-launch grammar rather than to
generic web-animation defaults. Four decisions carry that, and they are worth
knowing before changing any of them.

**Everything materialises; nothing merely fades.** A character resolves out of
`blur(0.1em)` as it arrives, and each emoji scales and un-blurs into place. A
thing that sharpens as it appears reads as physically coming into being, where
the same move on opacity alone reads as a stylesheet changing a number. This is
the single biggest contributor to the effect not feeling like a web page.

**easeOutExpo — `cubic-bezier(0.16, 1, 0.3, 1)` — on every entrance.** Nearly
all the distance is covered immediately and the tail is a long, slow settle.
That hard deceleration is what makes an arrival read as confident. A linear or
gently-eased entrance of the same duration feels like a slide.

**The whole section is choreographed, not just the text.** The eyebrow
materialises first, the headline types, then the tagline and the button row
arrive together. Before this the hero was two lines performing in front of two
lines that were simply already there, which is the thing a product-launch title
sequence never does — every element in the frame is placed by the same
sequence, so the section reads as one composition assembling.

**The emoji arrive, hold, and depart, in three separate acts.** The hold is the
part that matters and the part that was missing at first: roughly a third of
the flight sits at full presence with almost no movement. Without it the emoji
is at its most visible only in passing, and no single moment lets you identify
what it is. Entrance and exit are mirrors — both scale, both blur, in opposite
directions — for the same reason a panel dismisses along the path it arrived
on. A thing that materialises one way and vanishes another reads as two
unrelated events.

**Almost no overshoot, and a tilt rather than a spin.** The arrival scale peaks
at `1.03`. A pronounced bounce belongs to something the reader flicked or threw;
these arrive on their own, and past roughly `1.1` the motion stops reading as
settling and starts reading as bouncing. Rotation is held to a few degrees for
the same reason — it reads as cartoon physics well before it reads as craft.

### Why the letters do not scale

Scale is half of the materialise recipe and it is deliberately missing from the
text. `transform` does not apply to non-replaced inline elements, and the fix —
making every character `inline-block` — would break kerning across each word at
the headline's display size and change how `text-wrap: balance` distributes the
lines. `filter` and `opacity`, which is what the characters use, apply to
inline boxes without affecting how they are measured or where they break.

That is the right trade regardless: the letters are anchored to a baseline in a
line of type, and things anchored in place should not scale. The emoji are
free-floating, can take a transform, and carry the scale instead.

### The blur is front-loaded on purpose

The character's blur resolves in the first 30% of `ht-spark`, not across the
whole of it. Two reasons: the letter becomes readable at the moment it arrives
rather than trailing a soft ghost behind the caret, and at `TAG_MS` of 34ms only
about eight characters are blurring at any instant instead of twenty-six — the
difference between a filter that composites comfortably and one that does not.

Verified that the filter costs no layout: partway through the tagline, with the
blur live, every rendered line's left edge is on the same pixel as in the
finished text.

---

## Tuning it instead of removing it

Every knob is a named constant at the top of `hero-type.js`.

### The copy and the emoji

**`BURSTS`** — the phrases worth punctuating, and what to throw at each.

```js
var BURSTS = [
  { phrase: 'concept',               emojis: ['🎨', '🖌️'] },
  { phrase: 'AI product management', emojis: ['📦', '💼', '🤝'] }
];
```

Matching is on whole words, not raw substrings, so punctuation stuck to a word
does not break it — `ship:` matches `ship`, `management.` matches `management`.
A burst fires when the last character of its last word lands, and its emoji are
spread across the words the phrase covers, so they appear over the thing they
are celebrating however the line happens to have wrapped. Only the first
occurrence of a phrase fires.

Three emoji is about the ceiling before a burst reads as confetti rather than
as punctuation.

**`LINES`** — which elements type, in order. `title` gets the resting glow and
the shimmer; `tag` gets neither.

**`SUPPORTING`** — the parts of the hero that do not type but still belong to
the sequence: the eyebrow, which opens it, and the button row, which enters as
the tagline starts. Each entry names a *stage* rather than a delay in
milliseconds, so they are scheduled off the same clock that spaces the
characters and cannot drift out of step when the pacing constants change.

The button row deliberately enters at `tag` rather than at the end. It is the
only interactive thing in the hero, and holding it back until the last
character lands would leave the page's one control absent for over five
seconds. A sequence that looks composed is not worth a hero you cannot use
while it plays.

### Pacing

**`TITLE_MS`** (`100`) and **`TAG_MS`** (`46`) — milliseconds per character.
Two rates because the headline is 19 characters and the tagline is 88, and one
shared rate either rushes the headline or makes the tagline a chore. These land
the headline in about 1.4s and the tagline in about 3.0s; the last character
arrives a little past 5s and its flash finishes just after 6s.

The first version ran at `42`/`17` and was too fast to read — characters
arrived faster than the eye tracks them, which reads as the text simply
appearing rather than as typing. There is a ceiling as well as a floor: much
past `40`, `TAG_MS` stops reading as typing and starts reading as waiting.

**`START_DELAY`** (`320`) — the pause before the first character, measured from
when the webfont settles. **`GAP`** (`420`) — the beat between the two lines.

**`SPARK_MS`** (`900`) — how long a character's landing flash takes to decay.
**This must match the `ht-spark` duration in `hero-type.css`.** It is what the
script waits out before marking a line done, and marking it done is what drops
the per-character animations. That matters for more than tidiness: an animation
with `fill: both` keeps writing `text-shadow` at animation priority, which no
ordinary declaration can override, so until it ends the shimmer sweep cannot
turn the per-character glow off underneath it.

**`SWEEP_MS`** (`6000`) — the shimmer's duration, which likewise must match
`ht-sweep` in the CSS.

Read it as "about three seconds of visible sweep", not six: the band spends the
first and last quarter of the travel off the edges of the headline, where there
is nothing to see. The sweep is deliberately started just after the tagline
begins typing, so the two overlap; run them in sequence and the hero reads as a
queue of animations waiting their turn.

### The emoji flight

**`EMOJI_MS`** (`2400`), **`EMOJI_STAGGER`** (`260`) — one emoji's flight, and
the delay between them. Slow enough to actually be looked at: these are the one
purely decorative part of the effect, so if they pass too quickly to identify
there was no point drawing them. At `1300`/`130` the three product-line emoji
went by as an indistinct flicker. The stagger is what makes a burst read as a
handful of things thrown rather than one thing with three parts, and widening
it also spreads the burst over enough time to take in each glyph separately.

**`EMOJI_DRIFT`** (`54`) and **`EMOJI_RISE`** (`34`) — how far each emoji fans
sideways and climbs. The fan is wider than the climb on purpose: the tagline
sits directly under the headline, so an emoji thrown mostly upward travels
straight through *Hi, I'm Aditya Sharan.* at full opacity, which reads as
clutter over the one line the hero most wants you to look at. Arcing them
outward keeps the flight in the empty space beside the copy, and the fade is
well under way by the time they are level with the headline.

Do not raise `EMOJI_DRIFT` much. `.hero` sets `overflow-x: clip`, so anything
thrown wider is sliced off at the section edge rather than flying free.

The flight is deterministic — alternating direction, widening with each emoji
in the burst. Random values here made it feel different on every reload without
ever feeling better.

### Colour

In `hero-type.css`, at the top:

**`--ht-glow`** — the colour the glow is made of, `--color-accent` by default,
so it follows the theme toggle without this file knowing which theme is live.
The accent rather than the text colour, because a white glow behind white text
just reads as blur while a tinted one reads as light.

**`--ht-glow-rest`** (`0.45` dark / `0.3` light) and **`--ht-glow-flash`**
(`1` / `0.72`) — the resting and landing intensities, as alphas. Light mode is
quieter because a tinted halo around dark text on a pale ground muddies the
letter edges much faster than the same halo does around light text on a dark
one.

These started at `0.22`/`0.62` and were invisible in practice. The hero sits on
a drifting, mottled orb field, and against a busy background a glow needs real
strength before it reads as light rather than as compression noise — a value
that looks correct on a flat swatch disappears entirely over the orbs. The
resting glow is also painted at two radii (a tight halo that defines the letter
edges, a wide weak bloom that separates the headline from the field behind it);
a single mid-radius shadow at this strength reads as a blur.

**`--ht-shine`** — the bright band in the sweep. The accent, not white. White
was the first instinct — a sweep should read as light crossing the letters —
but dark mode's text is `#f5f5f7`, so a white band crossing it is a white band
on white and the sweep renders as nothing happening at all. The accent is the
one colour with real distance from the text in both themes.

### The sweep is a sheen, not a stripe — and three things make it one

**Width.** The gradient stops are fractions of an image three times the width
of the box, so the `40%`/`50%`/`60%` stops give about 30% of a headline of
falloff on each side of the bright point, lighting roughly 60% of the line at
once. Both directions were wrong first: at `42%`/`58%` the ramp was a quarter
of a headline and the hard edge read as a coloured object being dragged across
the type; opening it to `20%`/`80%` overcorrected so far that the falloff
spanned more than the whole line, and at the midpoint every letter sat inside
the bright zone at once — the headline just turned green for a moment instead
of being crossed by anything.

**Speed, and specifically the easing.** This is the one that actually made it
read as a stripe, and it hid behind the duration for two rounds of tuning. The
sweep ran on `cubic-bezier(0.33, 0, 0.25, 1)`, an ease-in-out — which spends
its speed in the middle, and the middle is exactly when the band is over the
letters. The travel looked far quicker than its duration suggested, because the
only part anyone sees was the fastest part of it; the slow head and tail were
spent off the edges where there is nothing to look at. Raising `SWEEP_MS` alone
barely helped for the same reason.

It is now `linear`. A light source crossing a surface moves at a constant rate,
the band enters and leaves beyond the element's edges so there are no starts or
stops to soften, and the duration finally means what it says.

**Direction — and dark mode sweeps *darker*.** This is the opposite of the
instinct and the only thing that works.

A sheen is a luminance event, not a colour one. Light mode gets its swing for
free: near-black text at L≈17 against a mid-teal band at L≈60 is more than
forty points and reads instantly. Dark mode has no room in that direction —
`#f5f5f7` is L≈96, already at the ceiling, so there is no brighter colour to
sweep toward. The accent at L≈72 is the best any bright tint can manage, and a
24-point drop, on a moving band, over a mottled orb field, genuinely reads as
nothing happening. Two rounds of tuning the tint up and down could not fix
that, because saturation was never the problem.

So dark mode's `--ht-shine` is the accent darkened toward black, landing near
L≈40 — a ~55-point drop from the text, more contrast than light mode has, in
the one direction dark mode has room to move. It reads as light raking across
the letters and briefly shading them, rather than as a colour being substituted
into them. Light mode keeps the brighter 70% accent, since it is already
working.

### Why the sweep no longer jolts

It used to set `text-shadow: none`, on the reasoning that a shadow under
transparent glyphs would be a shadow of nothing. That reasoning is simply
wrong: `text-shadow` is painted from the glyph outlines and is independent of
the fill, so it renders the same under a transparent or gradient-clipped colour
as under a solid one. The cost of the mistake was that the resting glow
switched off when the sweep started and snapped back on when it ended — the
sweep finished with the glow abruptly reappearing.

With the shadow left alone, both edges of the sweep are seamless:

- **Entering** gradient mode changes nothing, because the gradient's base stops
  are `var(--color-text)` — exactly what the glyphs were already painted with.
- **Leaving** it changes nothing, because the animation ends with the bright
  band parked off the right-hand edge, so the element is showing pure base
  colour at the moment the class comes off.

The headline is never seen to change paint mode in either direction, and the
glow burns continuously underneath the whole time. If you re-tune the gradient,
keep the base stops equal to `--color-text` or the jolt comes back.

### The caret does not blink

A blinking caret is the convention for a cursor sitting still in a text field,
where the blink is the only thing telling you it is live. This one is never
still — it advances every few frames, and the movement says everything the
blink would. All the blink contributed was a 45% chance of being invisible in
any given glance, which is exactly how it read.

Its width is `max(2.5px, 0.075em)` rather than a plain em. At the tagline's
1.2rem, `0.06em` was barely one device pixel — thin enough to land on a
fractional boundary and half disappear, which is why the caret kept vanishing
on the second line while looking fine on the headline.

### Why the glow does not flicker when a line finishes

`--ht-rest-shadow` is defined once and used in two places that must agree
exactly: the final keyframe of `ht-spark`, and the resting `text-shadow` on the
line itself. **If you change one, change the other.**

They must agree because the script cancels every character's animation at the
same instant, the moment a line finishes typing. Whatever the animation was
holding is dropped in a single frame and the inherited line shadow takes over,
across every letter simultaneously. Any difference between the two values
becomes a synchronised flash across the whole headline — which is what it was:
the animation ended on 0.28em/0.75em radii while the line painted 0.32em/0.9em,
so a green flicker fired across the text a moment before the sweep began.

Two details make the hand-off exact. Both values carry **three** shadows, since
a `text-shadow` list only interpolates against a list of the same length and a
mismatch falls back to a discrete swap. And the default — used by the tagline,
which has no resting glow — is three *transparent* shadows rather than `none`,
for the same reason.

Verified by reading the computed `text-shadow` on both sides of the hand-off:
the cancelled state is string-identical to the line's resting value, and the
animation's final frame matches it in every radius and alpha (it serialises in
`oklab` rather than `srgb`, being an interpolated value, but resolves to the
same colour).

### One trap in the sweep

`ht-sweep` animates `background-position` from `100%` to `0%`, and that range
is not arbitrary. With `background-size: 300%`, percentage positioning aligns
the same relative point of image and box, so the offset is `(box - image) × p`
= `-2p` box-widths: **only `p` between `0%` and `100%` keeps the image covering
the box at all.** Outside that range the image sits entirely off the element
and `no-repeat` paints nothing — and since `background-clip: text` means the
glyphs take their colour from that image, the headline renders *invisible*
rather than unswept. The first version of this used `150%` → `-50%` and the
headline vanished for the duration.

### Why the sweep is not a duplicate of the text

The obvious way to overlay a shimmer is a pseudo-element holding a copy of the
text. That copy has to re-wrap independently, and any disagreement with the
real text about where the lines break is glaring. Painting the real element
instead avoids the problem entirely — it can only run once every character is
at `opacity: 1`, which is exactly when it does run.
