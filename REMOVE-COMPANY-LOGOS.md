# Removing the company logos

The logo + role/company/location layout on the experience cards was added as a
self-contained, reversible change. Removing it restores the old single-row meta
(role, company pill, dates pushed right, no logo, no location).

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Put company logos on the experience cards' -1)"
```

The whole change is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.)

## The manual way

**1. Delete the logo files and this doc.**

```sh
rm assets/logo-*.{jpg,png} REMOVE-COMPANY-LOGOS.md
```

**2. Undo the markup** in `index.html`. Each of the five `.timeline-item`
blocks collapses back to:

```html
<div class="timeline-meta">
  <span class="timeline-role">…</span>
  <span class="timeline-company"><a href="…">…</a></span>
  <span class="timeline-dates">…</span>
</div>
```

Delete the `<span class="timeline-logo">` block, unwrap `.timeline-headline`
and drop `.timeline-when` along with its `.timeline-place` line.

**3. Undo the styles** in `styles.css`:

```sh
grep -n "timeline-logo\|timeline-headline\|timeline-when\|timeline-place\|is-wordmark" styles.css
```

- Delete every rule those names appear in, in both the main block and the
  `@media (max-width: 720px)` block.
- `.timeline-item` — restore `grid-template-columns: minmax(0, 1fr) auto`,
  areas `'meta meta' / 'desc tile'`, `column-gap: 24px`. In the mobile block,
  restore the single column and areas `'meta' / 'desc' / 'tile'`.
- `.timeline-meta` — back to `display: flex; flex-wrap: wrap; gap: 8px;
  align-items: baseline`.
- `.timeline-dates` — re-add `margin-left: auto`, and re-add
  `.timeline-dates { margin-left: 0 }` to the mobile block.
- `.timeline-company a` — the horizontal margin goes back to `-2px` from `-9px`
  (with the company inline again, the inset stops reading as a misalignment).
- `prefers-contrast: more` — drop `.timeline-place` from the colour group.

**4. Undo the script** — delete the one block marked `[logo]` in `script.js`:

```sh
grep -n "\[logo\]" script.js
```

`dark-mode.css` and `glass.js` were not touched at all.

## What it does while it is here

- **Logo, then role, then company** — the mark sits in its own grid column that
  spans the full card height, so the bullets indent under the role rather than
  under the logo. Dates and location stack right-aligned in their own column.
- **Full-bleed squircle**, the same shape `corner-shape: squircle` gives the
  ArtStation tiles, at icon scale (52px, 44px on mobile).
- **Monogram fallback.** `.timeline-logo::before` paints `data-monogram`
  behind the image. A logo that loads covers it; one whose file is missing is
  hidden by `script.js` and the letter shows through. **Adding a logo later
  needs no code change** — drop the file at the path the `<img>` already points
  at.
- **Wordmark detection.** `script.js` measures each logo and adds
  `.is-wordmark` when it is much wider or taller than square — those are fitted
  whole on a white plate instead of being cropped to two illegible letters.
  Hitwicket's wordmark is the case this exists for. It re-decides itself if you
  swap a logo for a differently-shaped file.

## Logo files

Convention is `assets/logo-<company>.<ext>`, square where possible, 200px+.

| Company | File |
|---|---|
| Battlebucks | `assets/logo-battlebucks.jpg` |
| Hitwicket | `assets/logo-hitwicket.png` |
| AltWorld | `assets/logo-altworld.png` |
| Warlands | `assets/logo-warlands.png` |
| Kotak Mahindra | `assets/logo-kotak.png` |

Any of these that isn't present renders as its monogram letter, not a broken
image.

## Scope and fallbacks

- Scoped to `.timeline-item` in the Experience section. The project cards,
  testimonials and nav are untouched.
- **Dark mode needs no extra work** — the tile border and monogram use the
  existing `--glass-hairline` / `--glass-chip` / `--color-accent` tokens, which
  `dark-mode.css` already re-points. The wordmark plate is deliberately a fixed
  white: a dark mark on a transparent ground would otherwise vanish.
- **`corner-shape: squircle`** is progressive — browsers without it get the
  plain 12px radius, which reads the same at this size.
- **`prefers-contrast: more`** gets the location in full-contrast text.
