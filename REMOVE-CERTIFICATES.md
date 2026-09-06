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

## What is in the panel, and what the tile face is made of

The panel holds five captioned scans, rendered out of the six-page graduation
PDF (page 2 is the verification stamp on the reverse of page 1 and is not one
of them). Each one links to its own single-page PDF:

| scan | PDF | what it is |
| --- | --- | --- |
| `assets/certificate-01.jpg` | `assets/certificate-01.pdf` | BSc, Animation & Visual Graphics — the degree |
| `assets/certificate-02.jpg` | `assets/certificate-02.pdf` | Minor, Film Appreciation |
| `assets/certificate-03.jpg` | `assets/certificate-03.pdf` | English & Communication Skills |
| `assets/certificate-04.jpg` | `assets/certificate-04.pdf` | Behavioral Science |
| `assets/certificate-05.jpg` | `assets/certificate-05.pdf` | Spanish, Foreign Language Course |

Five slots where the component ships four. That costs nothing: the strip
already scrolls and `certificates.js` caps it to the room on the side the panel
opened. Two of the five are portrait, and they keep their proportions rather
than being cropped to the other three's — `styles.css` sizes each slot from its
own image and treats the 3∶2 in the markup as a fallback for a missing file
only, which is why each `<img>` carries its true `width`/`height` and they are
not all the same number.

Each slot is a `<figure class="link-pop-shot cert-shot">` with a
`<figcaption>`; section 7 of `certificates.css` styles it and explains why the
caption sits inside the shot rather than in the seam between slots. Deleting
that section leaves five uncaptioned scans — the component's own behaviour —
not a broken panel.

Four of that section's rules exist together and should move together, because
each on its own is a half-fix for the same problem: with the strip showing only
one slot, the caption sat where a *panel title bar* sits and read as chrome
belonging to the panel rather than as the name of the document under it.

| rule | what it does |
| --- | --- |
| `max-height: 220px` on `.cert-shot-link img` | the load-bearing one — puts a second caption in the window, so the caption/scan pattern is visible rather than inferred |
| `background: var(--color-bg)` on `.cert-shot-cap` | the band takes the paper's tone instead of the shot's grey placeholder ground |
| `border` + `--pg-shot-edge: transparent` on `.cert-shot` | one hairline bounding caption and scan as a single slot, in every state |
| foot is title-only in `index.html` | the panel's own "Open any as PDF" duplicated each slot's badge and framed the strip as one document |

Reverting the height cap alone is the one to avoid: it puts the strip back to
one visible slot while leaving the other three tuned for a pattern the reader
can no longer see.

The border is worth a note if that rule is ever touched. Every other shot on the
site takes its edge from `pop-glass.css`'s inset `box-shadow`, which exists only
under `.link-pop[data-pg='lit']` — an unlit panel has none, and pop-glass's own
reduced-transparency block nulls it. In both of those the panel is opaque
`--color-bg`, which is exactly the caption's colour, so a shadow-based edge
would vanish precisely where it is needed most. `--pg-shot-edge` is stood down
to `transparent` so the lit panel does not draw a second line inside this one,
while keeping the drop shadow that lifts the slot off the glass.

The 2×2 collage on the tile face is four crops out of four of the same five
scans: `assets/certificate-tile-1…4.jpg`, drawn by `styles.css`'s
`.work-tile-grid img` with no rules of its own.

### The scans are links; the tile is still a button

Each `<figure>` holds an `<a class="cert-shot-link">` around its scan, pointing
at that certificate's PDF with `target="_blank" rel="noopener"`. Section 7b of
`certificates.css` covers the three decisions worth knowing:

- **The anchor is inside the figure, not around it.** `<figcaption>` has to be a
  direct child of its `<figure>`, so the anchor can only take the scan. It
  stretches an `::after` back over the whole slot to get the caption into the
  hit target.
- **They are focusable and named.** The site's other five panels make
  `.link-pop-shot` itself the anchor and then hide it (`tabindex="-1"`,
  `aria-hidden`), because all four of their slots point at the one URL the tile
  already points at. These five are five different documents behind a trigger
  that goes nowhere, so hiding them would leave the PDFs unreachable.
- **No `download` attribute.** It would suppress the new tab; the browser's own
  PDF viewer carries a download button, so a tab gets you both.

The trigger is still a `<button>` rather than an `<a>`, because it has nowhere
of its own to go — five documents, one tile. Give it a verification URL, or a
combined PDF, and it becomes `<a class="work-tile" href="…" target="_blank"
rel="noopener">` like the other six tiles, at which point the `button.work-tile`
reset in `certificates.css` stops matching and can be deleted with it. Weigh
section 6 of that file before you do: it un-hides the panel on touch precisely
because a button has nowhere to go, and an anchor would follow its link on tap
instead — phones would get the PDF and lose the previews.

## Regenerating the assets

Neither the PDFs nor the tile crops are checked in as sources — they are
derived from the five JPEGs, which are. Both recipes need only what ships with
macOS.

**The PDFs** wrap each JPEG's bytes verbatim in a one-page PDF as a `DCTDecode`
image XObject — no re-encode, so the PDF is the scan at its original quality
plus about 700 bytes of structure. The page is A4 in the scan's own orientation
with an 18pt margin, so it prints full-page instead of at whatever DPI the
scanner recorded. `sips -s format pdf` also works and is one line, but it sizes
the page from that DPI: the landscape scans come out on a 400×283pt page, which
prints at a third of a sheet.

**The tile crops** are 210×156 (the size the other six tiles use), cut to keep
the blue AMITY wordmark, because a cell is 48×36 CSS px and a whole certificate
scaled into that is a grey smudge between two letterbox gutters. The four are
the degree head, the wax seal and signatures off the minor, and the heads of
the two language certificates — the seal is the one warm cell, which is what
stops the 2×2 reading as a single wash.

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

`certificates.js` does two things: it decides which side the panel opens on,
and it closes the panel on Escape. Everything else works without it.

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

Escape is the smaller half, and it is there because the scans became links.
`script.js` closes any of these panels by blurring `group.querySelector('a')` —
the group's trigger, for the six tiles that are anchors. This trigger is a
`<button>`, so that selector used to match nothing and Escape did nothing here;
there was also nothing inside the panel to focus, so there was nothing to
escape from. Five scan links later the selector matches the *first scan*, and
blurring slot 1 while the reader is on slot 3 leaves the panel open on a key
that promises to close it. So this file blurs whatever actually holds focus,
which is what closes a panel held open by `:focus-within`.

It is fixed here rather than in `script.js` so neither file has to know about
the other. `script.js`'s handler still runs first; its blur lands on an element
that is not focused and does nothing.

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
- `assets/certificate-01…05.jpg` — the five scans
- `assets/certificate-01…05.pdf` — the five PDFs behind them
- `assets/certificate-tile-1…4.jpg` — the four collage crops

Nothing else on the page references any of those eleven files.

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
grep -rn "certificates\|certificate-\|cert-group\|cert-label\|cert-shot\|work-groups\|work-labels" \
  --include='*.html' --include='*.css' --include='*.js' .
```

Should return nothing.
