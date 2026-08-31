# Removing the call glass

The liquid-glass material on the "Book a 30-min call" button and its pop-up:
backdrop refraction with a real chromatic fringe, a travelling specular, and
text that deforms and splits into its colour channels at the panel edge.

The material is deliberately the same one `.header-inner` is made of: a thin
tint under the header's two-stop specular, `--glass-rim` for the edge, and no
painted border of any kind. Nothing here draws a coloured line around anything
— the colour at the edges comes from the three-pass displacement in `glass.js`,
where each channel bends by a different amount, so it appears only where the
surface actually curves.

Added as a self-contained, reversible feature on top of the call pop-up — it
re-draws what the pop-up is *made of*, it does not change where it sits, how big
it is, or how it opens.

Removing it returns the button to the plain `.btn-secondary` capsule and the
panel to the opaque white one `call-popup.css` draws.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Render the call button and pop-up in liquid glass' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm call-glass.css call-glass.js REMOVE-CALL-GLASS.md
```

**2. Unlink it** in `index.html` — two commented blocks:

```sh
grep -n "\[call-glass\]" index.html
```

That lists two sites: the `<link>` after `call-popup.css` in the `<head>`, and
the `<script>` after `call-popup.js`. Delete each comment along with the tag it
introduces.

That is the entire removal. `glass.js`, `droplet-buttons.*`, `meeting-picker.*`,
`call-popup.*`, `dial-tick.js`, `script.js` and `styles.css` were never touched
— there is no edit anywhere to reverse.

## Why there is no markup to unpick

The button's label is its own element so it can be addressed without touching
the pill's rim or its shadow. Rather than put a `<span>` in `index.html`,
`call-glass.js` wraps the button's text node at runtime. Delete the script and
the label goes back to being a bare text node.

The label is **not** lensed, on purpose. It was, once: a `contentLens` at
dispersion 0.38 magnified it through the pill's curve. Most of a label sits
across the flat centre of a capsule where the map is neutral, so the deform
bought nothing there — what it bought was a per-channel split on 15px
letterforms, which at that size reads as text gone soft rather than as glass.
The header's nav labels sit on the same material unfiltered, and they are
crisp.

The panel needed a second element too — one to be the glass surface while
`.mp-panel` became the filtered content. That one was already in the markup:
`.mp-collapse > div`, the accordion's old inner clipper, which `call-popup.css`
had already reduced to a plain wrapper. `call-glass.js` gives it the class
`cg-slab`; removing the script takes the class with it.

## Turning it off without deleting it

Every rule in `call-glass.css` is scoped under `.mp[data-glass='on']`, a hook
only `call-glass.js` sets. Removing the `<script>` tag alone leaves the
stylesheet loaded and completely inert — the pop-up falls back to
`call-popup.css`'s opaque panel, intact.

The script also declines to set that hook when the visitor asks for
`prefers-reduced-transparency: reduce` or `prefers-contrast: more`, which is the
same fallback path.

## What removing it does *not* affect

- **The hero buttons.** They have their own droplet treatment in
  `droplet-buttons.css` / `.js`, scoped to `.hero-actions .btn`. This feature
  reuses `liquidGlass()` from `glass.js` but adds nothing to it.
- **The picker's behaviour.** Dates, times, validation and the Apps Script
  submission all live in `meeting-picker.js`, untouched.
- **Where the panel opens.** `call-popup.js` still owns placement, the fit
  ladder, dismissal, focus and the bottom sheet. It watches `data-open`;
  `call-glass.js` watches `data-open` too, independently. Neither binds the
  toggle, so removing either one leaves the other working.

## If you keep it but want to retune it

Two numbers do nearly all the work, both in `call-glass.js`:

| | where | what it does |
|---|---|---|
| `scale` on the slab lens | in `liquidGlass(slab, …)` | px the backdrop bends at the panel rim. Set against `band` the way the header's is — displacement a few times the band it is spread over is what makes the edge visibly bend the page behind it rather than just tint it. |
| `scale` on the pill lens | in `liquidGlass(toggle, …)` | px the backdrop bends at the button rim. Has a hard ceiling: past roughly the band, the rim samples outside Chromium's element-clipped backdrop capture and paints a rainbow smear along the bottom edge. The comment at that line has the numbers. |
| `scale` on `panelLens` | in `contentLens(panel, …)` | px of text displacement at the panel rim. Held down by the selection band, whose ends sit at the content edge and smear before the text does. |

`dispersion` on any of them is the width of the colour split — keep it small, it
is a rim fringe, not a prism. `0.15` is the header's.

Two tints carry the rest of the look, both at the top of `call-glass.css`:
`--cg-slab` (the panel) and `--cg-pill` (the two capsules). The panel floats
over body copy with six dials on it, so it is held a little heavier than the
header's 16%; raise it toward `0.45` if the paragraph underneath starts reading
through. `--cg-band` and `--cg-field` are mixed *relative* to `--cg-slab` — it
is the gap between them that marks the selected row, so move them together.
