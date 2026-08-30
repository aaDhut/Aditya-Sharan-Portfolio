# Removing dark mode

Dark mode was added as a self-contained, reversible feature. Removing it takes
about a minute and leaves the site exactly as it was before.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Add dark mode, following the system setting' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.)

## The manual way

**1. Delete the theme file.**

```sh
rm dark-mode.css REMOVE-DARK-MODE.md
```

**2. Unlink it** in `index.html` — remove the commented `<link>` block just
after the `styles.css` link:

```html
<!-- [dark-mode] Removable feature. ... -->
<link rel="stylesheet" href="dark-mode.css">
```

**3. Undo the tokenizing in `styles.css`** (optional).

Dark mode needed a handful of hardcoded colours turned into variables so it had
something to override. Those edits are all in `styles.css`, all marked, and all
invisible in light mode — the site renders identically whether you revert them
or not. Leaving them is fine and arguably tidier than it was before.

To find every one of them:

```sh
grep -n "\[dark-mode\]" styles.css
```

That lists 15 sites: one token block inside `:root`, and 14 use sites that now
read from it. To revert, delete the `[dark-mode] theme hooks` block in `:root`
and inline each token's value back at its use site:

| Token | Original value |
| --- | --- |
| `--shadow-rgb` | `31, 38, 34` — used as `rgba(var(--shadow-rgb), X)`, was `rgba(31, 38, 34, X)` |
| `--shadow-portrait` | `0 12px 32px -12px rgba(0, 0, 0, 0.25)` |
| `--glass-specular-top` | `rgba(255, 255, 255, 0.22)` |
| `--glass-specular-bottom` | `rgba(255, 255, 255, 0.1)` |
| `--glass-edge` | `rgba(31, 38, 34, 0.13)` |
| `--glass-badge` | `rgba(255, 255, 255, 0.88)` |
| `--glass-sheet` | `rgba(255, 255, 255, 0.95)` |
| `--nav-label-halo` | `0 0 4px rgba(255, 255, 255, 0.65), 0 0 1px rgba(255, 255, 255, 0.6)` |
| `--color-text-hero` | `#3a3a3a` |
| `--color-text-card` | `#4f4f4f` |

Nothing else in `styles.css` was touched, and `script.js` and `glass.js` were
not touched at all — the feature ships no JavaScript.

## What it does while it is here

- Follows the operating system or browser setting automatically, via
  `@media (prefers-color-scheme: dark)`. Pure CSS, so it applies on first paint
  with no flash of the wrong theme.
- Ships no toggle UI. The `:root[data-theme="dark"]` and `data-theme="light"`
  hooks exist so a toggle can be added later without restructuring anything.
- Forces the light palette when printing, so a dark-mode browser does not print
  near-white text onto white paper.
