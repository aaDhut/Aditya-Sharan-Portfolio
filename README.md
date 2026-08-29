# Portfolio site

Plain HTML/CSS/JS — no build step needed.

## Files
- `index.html` — all page content and text. Search for text in `[brackets]` — that's placeholder copy to replace with your own.
- `styles.css` — colors, fonts, spacing. The accent color is set once at the top (`--color-accent` in `:root`) — change it there to re-theme the whole site.
- `script.js` — small bits of interactivity (mobile menu, footer year).
- `liquid-glass-init.js` — wires up the Apple-style "liquid glass" effect on the nav bar and hero buttons (see below).
- `assets/resume.pdf` — add your résumé PDF here; the "Download résumé" button already links to it.

## Liquid glass effect
The nav bar and the two hero buttons use [@ybouane/liquidglass](https://github.com/ybouane/liquidglass), a small WebGL library that recreates Apple's real-time glass refraction/blur/specular look, loaded straight from a CDN (no install needed). It's layered on top of a plain CSS `backdrop-filter` blur, so if a browser has WebGL disabled or the CDN is unreachable, those elements just fall back to a normal frosted-glass look instead of breaking.
- To retune the effect (more/less blur, glow, tint), edit the `dataset.config` values in `liquid-glass-init.js` — see the [library's README](https://github.com/ybouane/liquidglass) for what each option does.
- To remove it entirely, delete the `<script type="module" src="liquid-glass-init.js">` line from `index.html` — the CSS fallback look stays.

## Preview locally
Open `index.html` directly in a browser, or run a local server from this folder:
```
python3 -m http.server 8000
```
then visit `http://localhost:8000`.

## Deploy (free options)
- **GitHub Pages**: push this folder to a GitHub repo, enable Pages in repo settings.
- **Netlify / Vercel**: drag-and-drop this folder in their dashboard, or connect a GitHub repo.

## To do before publishing
- Replace all `[bracketed]` placeholder text in `index.html` (name, bio, experience, projects, skills, testimonials, email, LinkedIn URL).
- Add `assets/resume.pdf`.
