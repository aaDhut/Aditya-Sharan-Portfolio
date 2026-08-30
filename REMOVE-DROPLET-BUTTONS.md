# Removing the droplet buttons

The liquid-glass treatment on the two hero buttons was added as a
self-contained, reversible feature. Removing it takes about a minute and leaves
the buttons exactly as they were before — the plain frosted capsules defined in
`styles.css`.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Make the hero buttons liquid glass' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.)

## The manual way

**1. Delete the feature files.**

```sh
rm droplet-buttons.css droplet-buttons.js REMOVE-DROPLET-BUTTONS.md
```

**2. Unlink them** in `index.html` — remove the two commented blocks:

```html
<!-- [droplet] Removable feature. ... -->
<link rel="stylesheet" href="droplet-buttons.css">
```

```html
<!-- [droplet] Removable feature. ... -->
<script src="droplet-buttons.js"></script>
```

**3. Undo the `setScale` hook in `glass.js`** (optional).

The hover swell needed a way to change the lens strength after the filter was
built, which `glass.js` did not expose. That is three small additions, all
marked, and all inert unless something calls them — the nav pill never does, so
the file behaves identically whether you revert them or not.

```sh
grep -n "\[droplet\]" glass.js
```

That lists three sites: the `passes` array declaration, the `passes.push(...)`
line inside `displacePass()`, and the `setScale` method on each of the two
returned handles. To revert, delete all of them.

`styles.css` and `script.js` were not touched at all.

## What it does while it is here

- **Real refraction, not blur.** `droplet-buttons.js` points the existing
  `glass.js` lens at `.hero-actions .btn`, retuned for a small capsule — the
  backdrop bends through the rim instead of being frosted flat. The nav bar's
  settings are far too strong at this size and shear the image.
- **Chromatic aberration** at the rim only, from `glass.js`'s three-pass
  channel split, plus a CSS conic hairline on the edge itself.
- **Specular** — a single glint that tracks the pointer via `--gx`/`--gy`, and
  only while the pointer is on the button. At rest the capsules carry no
  painted highlight at all: a soft overhead wash was tried and pulled, because
  on a capsule this small it read as haze on the glass rather than light on a
  curved surface.
- **Deformation** — the lens bends harder as the pointer approaches (the swell,
  which only JS can do), and the capsule squashes wider-and-shorter under a
  press before overshooting back to round.

## Scope and fallbacks

- Scoped to `.hero-actions .btn` only. The contact-section buttons and the nav
  pills are untouched.
- **Safari and Firefox** cannot run an SVG filter inside `backdrop-filter`.
  `glass.js` already detects this and falls back to a frosted blur; the
  specular, chromatic rim and squash are ordinary CSS, so it still reads as
  glass, just without the live bend.
- **`prefers-reduced-motion`** keeps the refraction and specular, which are
  static, and drops the glint tracking, swell and squash.
- Dark mode needs no extra work: the file defines `--droplet-*` tokens with
  `--dark-droplet-*` counterparts, re-pointed under the same two triggers
  `dark-mode.css` uses.
