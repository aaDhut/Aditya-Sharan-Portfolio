# Removing the dial tick

The detent click the picker's wheels make as values pass under the selection
band. Added as a self-contained, reversible feature on top of the meeting
picker — it reads the wheels, it does not modify them.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Add a detent tick to the picker wheels' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm dial-tick.js REMOVE-DIAL-TICK.md
```

**2. Unlink it** in `index.html` — one commented block:

```sh
grep -n "\[dial-tick\]" index.html
```

That lists a single site: the `<script>` between `meeting-picker.js` and
`script.js`. Delete the comment along with the tag it introduces.

That is the entire removal. `meeting-picker.js`, `meeting-picker.css`,
`styles.css`, `script.js` and `glass.js` were never touched — there is no
edit anywhere to reverse, and the picker keeps working exactly as it did.

The reverse is also true: remove the meeting picker and leave this file in
place, and it does nothing. It looks for `.mp` on load and returns if it is
not there.

---

## Tuning it instead of removing it

Every number worth changing is a named constant at the top of `dial-tick.js`.

**Too loud, or too quiet.** `VOLUME` is a plain multiplier over the whole
effect and the only one you normally need. It ships at `1.28`, tuned by ear as
a foreground sound rather than a subliminal one.

It is not capped at `1`. The two envelopes in `play()` peak at `0.18` and
`0.07`, so the real ceiling is just under `4`, where their sum hits full scale
and the output starts hard-clipping. At `1.28` the peak is about `0.32`, which
is a normal level for a UI sound with room to spare.

Gain is a blunt lever past roughly here, though. The tick is only 25ms long,
so adding volume makes it sharper rather than fuller, and eventually just
harsh. If it needs more presence, lengthen the two
`exponentialRampToValueAtTime` decays in `play()` (`0.025` and `0.03`) or
raise the `thump` peak relative to the `burst` peak — a longer, bassier tick
reads as louder at the same gain.

**Turns into a buzz when you fling a wheel.** Raise `MIN_GAP_MS`. It is the
floor in milliseconds between two ticks; crossings that arrive faster are
dropped rather than played. At 28 the ceiling is about 35 ticks a second.
Going to 40 thins a fast spin out noticeably.

**Fast scrolling feels aggressive.** Lower `FAST_STRENGTH` (default `0.35`).
Ticks fade toward that fraction of full volume as the gap between them
shrinks from `SLOW_MS` to `FAST_MS`, so a deliberate drag stays crisp while a
fling goes soft. Setting it to `1` disables the fade entirely, which is worth
hearing once to understand why it is there.

**A different click.** The sound is two parts in `play()`: a bandpass-filtered
noise burst, which is the click you actually hear, and a short 180Hz sine
under it for body. Raising `band.frequency` makes it thinner and more plastic;
lowering it toward 1200 makes it woodier. Dropping the `thump` half entirely
leaves something closer to a camera shutter.

## What it deliberately does not do

**No sound before a gesture.** The `AudioContext` is not constructed until a
`pointerdown` or `keydown` lands inside `.mp`. Browsers require a gesture
anyway, but the stronger reason is that the six wheels scroll themselves into
position on page load, and none of that is audible because there is nothing
built yet to hear it.

**Nothing while the tab is in the background,** and nothing at all under
`prefers-reduced-motion: reduce`. Reduced motion is strictly about movement,
but someone who has asked their system to calm interfaces down is not asking
for an extra sensory channel either.

**No mute button.** Considered and skipped: the tick is quiet, it only plays
after someone has deliberately opened the picker and dragged a wheel, and a
speaker icon in the header would cost more attention than the thing it
governs. If that turns out to be wrong, the hook is one boolean guarding
`tick()`.

**No haptics.** `navigator.vibrate()` would pair naturally with this, but iOS
Safari ignores it entirely, so it would only ever fire for some visitors — and
on the ones where it does work it can stutter the scroll it is meant to be
accompanying.
