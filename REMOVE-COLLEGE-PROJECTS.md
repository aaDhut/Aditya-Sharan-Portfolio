# Removing the college projects

The three ArtStation student films on the Amity University card in Education —
SAMAT, The Watchman and Chill Beach Guy — as a row of work tiles with preview
panels, each panel holding playable YouTube embeds alongside the stills.

Built on the existing `.work-tile` / `.link-pop` components that `styles.css`
already draws for the four Experience tiles. Nothing here re-draws those; this
feature adds a row that holds three of them, the video play cards inside the
strip, and the two open-states that a playable embed needs and a pure hover
tooltip does not.

Removing it returns the Amity card to its bullets and leaves the four
Experience tiles untouched.

## Why it isn't pure CSS like the other four

Worth knowing before you change anything here, because it is the one thing that
looks like over-engineering and isn't.

The other four panels open and close entirely on `:hover` / `:focus-within` on
`.work-link`. These three cannot, because **focus inside a cross-origin iframe
does not match `:focus-within` in the parent document**. Measured in Chrome, not
assumed: after clicking into a YouTube embed, `document.activeElement` is the
`IFRAME` element while the ancestor group stops matching `:focus-within`. Left
on the CSS alone, the panel fades out from under a playing video the moment the
pointer leaves — audio still running, panel gone.

So `college-projects.js` holds the panel open with a `data-playing` attribute
instead, and owns every way back out of it: the close button, Escape, a click
outside, and opening a different video.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Add the three ArtStation college projects' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm college-projects.css college-projects.js REMOVE-COLLEGE-PROJECTS.md
```

**2. Unlink it** in `index.html` — two commented blocks:

```sh
grep -n "\[college-projects\]" index.html
```

That lists three sites: the `<link>` after `text-glow.css` in the `<head>`, the
`<script>` after `script.js`, and the markup block itself. Delete each comment
along with the tag it introduces.

**3. Delete the markup.** The third hit above is the `.work-row` block on the
Amity card — the `<div class="work-row">` … `</div>` that sits directly after
the `timeline-desc-list` ending `Organised the university's design events`.
Delete the comment and the whole `div`. Leave the `<ul class="timeline-desc-list">`
above it alone.

**4. Delete the assets.**

```sh
rm assets/artstation-samat-*.jpg \
   assets/artstation-watchman-*.jpg \
   assets/artstation-chillbeach-*.jpg
```

That is 39 files — 22 gallery stills, 5 YouTube poster frames and 12 tile
crops, 2.6MB in total. Nothing else references them; the four Experience
projects use `artstation-battlebucks-*`, `-hitwicket-*`, `-altworld-*` and
`-warlands-*`, which this glob does not touch.

That is the entire removal. `styles.css`, `script.js`, `pop-glass.css`,
`pop-glass.js` and `glass.js` are all unmodified by this feature and need no
edits.

## What the feature touches that it does not own

Three things it leans on, in case you are changing them rather than removing
this:

- **`script.js`'s panel loader** (`.link-pop-shot img`) lazy-loads these
  panels' stills on first hover, same as the other four. It does not reach the
  play-card posters — those are not shots — so `college-projects.js` loads them
  itself off the same trigger. If you change how that deferral works, change
  both.
- **`pop-glass.js`** picks these panels up automatically: it selects every
  `.link-pop` and walks up to `.work-link`, which these match. They get the
  droplet lens with no registration.
- **`styles.css`'s `@media (hover: none)`** rule hides every `.link-pop` on
  touch. `college-projects.css` overrides it for these three only, because on a
  phone there is otherwise no way to reach the films without leaving the site.
  The tap opens the panel rather than following the link; the footer link is
  still the way out to ArtStation.

## The layout constraint

`.work-row` sits in **`grid-area: tile`** — the same cell the four Experience
cards give to their single work tile, which is what keeps project work in the
same place on every card in both sections. That cell is content-sized, so the
row takes what it asks for and the description column gets the rest; the three
tiles are drawn at 96x72 rather than the Experience 140x104 so that ask stays
around 312px instead of 444px. Below 720px the timeline's own template moves
`tile` to a full-width row under the bullets and the tiles take their full size
back.

Do not give it `grid-area: desc`. That was the first attempt and it puts the
row in the same cell as `.timeline-desc-list`, printing the tiles straight over
the bullets.

The `College projects` caption is a `.work-row-label` span, the last child of
`.work-row` — a full-width flex item, so it breaks onto its own line under
however many tiles fit per row. It goes with the row when the row goes.

## The glass during playback

The panel's glass comes off while a film plays and goes back on when it stops.
That is section 4c of `college-projects.css`, keyed on `[data-playing]`, and it
is the whole mechanism — the JS only sets the attribute.

A cross-origin iframe is promoted to its own compositing layer, and Chromium
resolves that layer against the panel's `backdrop-filter` badly in both
directions: the video is composited *under* the panel's surface instead of on
it, and the lens's chromatic dispersion catches the layer's edge and traces a
saturated red-green-blue outline round the whole video.

An earlier version tried to fix only the second half from the JS, driving the
lens's displacement to zero for the duration through the `panel._pgLens` handle
`pop-glass.js` publishes. It did not work. Mutating an SVG filter's
`feDisplacementMap` reliably invalidates a `filter`; it does not reliably
invalidate a `backdrop-filter` that already references that filter by `url()`,
so the panel went on painting the bend it was built with. It also left the
video behind the glass, which was never the bend's doing. That code is gone and
nothing reads `_pgLens` any more.

The panel takes the same opaque treatment `pop-glass.css`'s
`prefers-reduced-transparency` block gives it — opaque fill, real border,
fringe off, seams back to 6px — because a translucent tint with no blur behind
it is not glass, it is a smeared card. The four panels with no video in them
are untouched.
