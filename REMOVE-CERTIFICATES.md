# Removing the certificates cluster

A second labelled group in the `tile` cell of the Amity University card in
Education, sitting to the left of the three College Projects tiles with a
hairline rule between them. One work tile with a preview panel, under its own
`CERTIFICATES` overline.

Built on the same `.work-tile` / `.link-pop` components `styles.css` already
draws for the Experience tiles. Nothing here re-draws those.

Removing it returns the `tile` cell to the college row alone, at exactly the
size and position it had before — no other card, section or breakpoint is
touched.

## It is a scaffold, not finished content

Nothing in the tile or the panel is real yet. Three swaps turn it into the
finished thing, all of them inside the one `[certificates]` block in
`index.html`, all of them described in a comment there:

1. **The trigger is a `<button>`, not an `<a>`** — there is no verification URL
   to point at yet. Give it one and it becomes an `<a class="work-tile"
   href="…" target="_blank" rel="noopener">` like the other six tiles, at which
   point the `button.work-tile` reset in `certificates.css` stops matching and
   can be deleted with it. Section 6 of that file (touch) should come out at the
   same time: it exists only because a button with nowhere to go would otherwise
   do nothing when tapped, and an anchor has somewhere to go.
2. **The 2×2 collage is four drawn `<span class="cert-slot">` cells.** Replace
   each with `<img src="assets/certificate-tile-N.jpg" alt="" width="210"
   height="156" loading="lazy" decoding="async">`. They are deliberately not
   `<img>` while the files are missing: `script.js` catches a 404 on a
   `.link-pop-shot` image and hides it, but it does not watch
   `.work-tile-grid`, so a missing file there paints Chrome's broken-image
   glyph straight onto the tile.
3. **The four panel slots already point at `assets/certificate-0N.jpg`** via
   `data-src`. Those are safe to leave dangling — `script.js` hides a shot that
   404s and the slot keeps its own gradient. Drop the files in and they light up
   with no markup change.

## Why it overrides college-projects.css instead of editing it

`.work-row` used to be the grid item in the `tile` cell: it carried
`grid-area: tile` and the `-28px` lift that keeps the tiles from costing the
card any height. It is now the right-hand child of `.work-groups`, which is the
grid item, so both of those declarations have to be handed back.

They are handed back **from `certificates.css`**, with
`.work-groups > .work-row`, rather than by editing `college-projects.css`. That
keeps the two features independent in both directions: delete this one and the
college row reclaims the cell on its own, delete that one and nothing here
breaks. Nothing in `certificates.css` inherits a `college-projects` selector —
the overline type is duplicated rather than shared for the same reason.

The two-class selector also matters because `college-projects.css` re-states
`.work-row { margin-top: 4px }` inside a `max-width: 720px` block, and a media
query adds no specificity. `.work-groups > .work-row` (0,2,0) wins at every
width; `.work-groups` picks that 4px up itself at the same breakpoint.

## The cost it added, in case that is why you are here

The `tile` grid column is content-sized — it takes what the row asks for and the
description column gets the rest of the ~836px the two share. Three college
tiles at 96px plus two 10px seams came to 308, leaving the bullets ~508. This
cluster adds 121 (one 96px tile, two 12px gaps, a 1px rule), so the bullets are
down to ~387 and the longer of the two, "Received the Best Showreel award at
Animation Day", may take a second line and grow the card by ~26px.

If that is the problem rather than the feature, turn `--cert-tile-w` /
`--cert-tile-h` at the top of `certificates.css` before removing anything. Note
that taking the certificate tile below the college tiles' 96px makes it read as
a different kind of object rather than a sibling — if you shrink, shrink both.

## What the JS is for

`certificates.js` decides which side the panel opens on, and that is all it
does. Everything else works without it.

It is not optional in practice. Every `.link-pop` opens upward, which is right
for the four Experience tiles — low on tall cards in the middle of a long page.
This tile is the last thing on the last Education card and the panel is ~400px,
so upward was clipped by the nav in every position a reader is actually in:
measured across 700–1000px viewports, 120px of it was lost with the card
centred in a 1000px window and the whole panel was gone with the section
scrolled to the top. Not an edge case — the default state.

So it makes the same measurement `college-projects.js` makes, with none of the
latch around it: these panels hold no video, so nothing needs to hold them open
and there is nothing to close. With it, the panel fits inside the viewport in
all nine combinations of {700, 900, 1100}px tall × {card centred, section top,
card at bottom}.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Add the certificates cluster' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase.)

## By hand

Four files, three edits.

### 1. Delete

- `certificates.css`
- `certificates.js`
- `REMOVE-CERTIFICATES.md` (this file)

### 2. `index.html` — the two tags

Delete the `[certificates]` comment and the `<link>` under it in `<head>`
(directly after `college-projects.css`), and the `[certificates]` comment and
the `<script>` under it before `</body>` (directly after
`college-projects.js`).

`.timeline-when` is untouched by this feature — the College Projects heading is
still a direct child of it, exactly as `college-projects.css` left it. Nothing
to undo there.

### 3. `index.html` — the wrapper

Delete the `[certificates]` comment block, `<div class="work-groups">`, the
whole `<div class="cert-group">…</div>`, and the `work-groups-rule` span — every
line from the comment down to the one directly above
`<!-- [college-projects] Student films from the Amity years`.

Then, at the far end of the college row, delete the
`<!-- [certificates] closes .work-groups -->` comment and the `</div>` under it,
directly above the `</li>`.

The college row is left at its original indentation on purpose, so it is not
inside the wrapper by two spaces the way it would normally be. That was to keep
the feature out of that block's diff; it also means there is nothing to
re-indent when you take the wrapper away.

### Check afterwards

```sh
grep -rn "certificates\|cert-group\|cert-label\|cert-slot\|work-groups\|work-labels" \
  --include='*.html' --include='*.css' --include='*.js' .
```

Should return nothing.
