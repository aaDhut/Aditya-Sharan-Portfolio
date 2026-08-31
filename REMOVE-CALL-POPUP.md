# Removing the call pop-up

The floating panel the "Book a 30-min call" button opens. Added as a
self-contained, reversible feature on top of the meeting picker — it re-draws
the picker's open state, it does not modify the picker.

Removing it returns the button to its original behaviour: an accordion that
expands in place, pushing the page below it down.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Open the call picker as a floating pop-up' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm call-popup.css call-popup.js REMOVE-CALL-POPUP.md
```

**2. Unlink it** in `index.html` — two commented blocks:

```sh
grep -n "\[call-popup\]" index.html
```

That lists two sites: the `<link>` after `meeting-picker.css` in the `<head>`,
and the `<script>` between `dial-tick.js` and `script.js`. Delete each comment
along with the tag it introduces.

That is the entire removal. `meeting-picker.js`, `meeting-picker.css`,
`dial-tick.js`, `styles.css`, `script.js` and `glass.js` were never touched —
there is no edit anywhere to reverse, and the picker keeps working exactly as
it did before.

## Why it comes apart this cleanly

The picker already owned the open/close state before this feature existed: its
toggle flips `data-open` on `.mp` and mirrors it to `aria-expanded`. The pop-up
never binds that button and never replaces that logic. It only:

- **watches** `data-open` through a `MutationObserver`, to know when to measure
- **re-styles** the same open state, through rules scoped entirely under
  `.mp[data-popup='on']`

`data-popup` is set by `call-popup.js` at load. That is the load-bearing detail
for removal: every rule in `call-popup.css` hangs off it, so the stylesheet
cannot half-apply. Delete the script and leave the stylesheet behind by mistake
and the accordion still works — the attribute is never set, so not one rule in
the file matches.

The reverse is also true: remove the meeting picker and leave this feature in
place, and it does nothing. It looks for `.mp` on load and returns if it is not
there.

## What it changes while it is installed

Worth knowing if you are deciding whether to keep it, or debugging something
that looks off:

- **The panel goes opaque.** `meeting-picker.css` builds it as glass, which was
  right for a block sitting inline on a flat section colour. Floating over body
  copy it has to be solid, for the same reason `styles.css` gives on `.link-pop`
  — the page's material rules only ever stack one translucent surface.
- **Three fills are re-mixed to suit that.** `--mp-band`, `--mp-band-edge` and
  `--mp-field` were tuned against glass; in light mode they are near-white, and
  on an opaque white panel they would disappear. `call-popup.css` re-points them
  as `--cp-*` in its own scope. `meeting-picker.css` keeps its originals, which
  is what the accordion needs the moment this is removed.
- **The layout is two-piece on purpose.** `.mp-collapse` does the centring,
  `.mp-panel` does the motion. If you merge them, every transform on the panel
  has to repeat `translateX(-50%)` — a transform is one value, not a stack.
- **The dials sit side by side.** Stacked at full size the picker is ~690px
  tall and a laptop has 500–670 above the button, so it used to open with its
  own scrollbar and the Next button below the fold. In the pop-up the date
  group and the time group are two grid columns, which is ~425px — the panel
  is wider (560px) and the whole thing is visible at once. The accordion keeps
  the stacked layout: it has the page to grow into.
- **It shrinks itself rather than scroll.** `data-fit` on `.mp` is a three-rung
  ladder — full, `compact` (three visible values per dial instead of five),
  `tight` (three, smaller). `call-popup.js` measures the panel against the room
  it actually has and steps down until it fits, on open, on resize and when the
  step changes. Scrolling the page can take a rung off but never puts one back;
  the next open starts from the top again.
- **Opening the panel scrolls the page instantly**, where it used to glide.
  `makeRoom` is a measurement step now — the fit ladder reads the result on the
  next line — so it suppresses `scroll-behavior: smooth` for that one call.
- **It becomes a bottom sheet when it cannot be anchored**: under 560px wide,
  or under 520px tall, with a scrim and a body scroll lock. Pinned to the
  bottom edge it is measured against 86vh instead of the scraps above a button,
  which is what makes a short window fit at all. That trigger is written in
  three places — `SHEET_AT` in the JS, the sheet media query in the CSS, and
  the reduced-motion block at the end of the CSS — and they have to change
  together.
