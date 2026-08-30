# Portfolio site

Plain HTML/CSS/JS — no build step needed.

## Files
- `index.html` — all page content and text. Search for text in `[brackets]` — that's placeholder copy to replace with your own.
- `styles.css` — colors, fonts, spacing. The accent color is set once at the top (`--color-accent` in `:root`) — change it there to re-theme the whole site.
- `script.js` — small bits of interactivity (mobile menu, footer year).
- `liquid-glass-init.js` — wires up the Apple-style "liquid glass" effect on the nav bar and hero buttons (see below).
- `assets/resume.pdf` — add your résumé PDF here; the "Download résumé" button already links to it.
- `meeting-picker.css` / `meeting-picker.js` — the Apple-clock booking picker in the contact section (see below).
- `meeting-invite.gs` — the Google Apps Script that holds each request for your approval and turns the ones you accept into a real Calendar invite with a Meet link. Not loaded by the site; it is pasted into script.google.com.

## Liquid glass effect
The nav bar and the two hero buttons use [@ybouane/liquidglass](https://github.com/ybouane/liquidglass), a small WebGL library that recreates Apple's real-time glass refraction/blur/specular look, loaded straight from a CDN (no install needed). It's layered on top of a plain CSS `backdrop-filter` blur, so if a browser has WebGL disabled or the CDN is unreachable, those elements just fall back to a normal frosted-glass look instead of breaking.
- To retune the effect (more/less blur, glow, tint), edit the `dataset.config` values in `liquid-glass-init.js` — see the [library's README](https://github.com/ybouane/liquidglass) for what each option does.
- To remove it entirely, delete the `<script type="module" src="liquid-glass-init.js">` line from `index.html` — the CSS fallback look stays.

## Book a call
The "Get in touch" section has a picker with six iOS-style wheels — day/month/year and hour/minute/AM-PM — that takes a visitor from a slot to a request in three steps. Any day and any hour is bookable, AM or PM, in 5-minute steps up to a year ahead; the only limits are 15 minutes' notice and, once the script below is wired up, your real free/busy. The visitor picks in their own timezone and the panel shows the IST equivalent.

**It works with no setup**, but out of the box the last step is a hand-off: *Request meeting* opens a prefilled Google Calendar page in the visitor's tab, they press Save, and Google mails you the invite. It costs them a click, a Google account, and no Meet link is attached.

Wiring up `meeting-invite.gs` removes all of that. The visitor presses one button and is done; the request is held, never booked, and you decide:

1. The request lands as a row in a **Meeting requests** sheet in your Drive, and the visitor gets a short "got it" email.
2. You get an email with one link to a review page — who, when, in both timezones, and what it is about.
3. **Approve** creates the event with a Google Meet link and lets Google mail them the real invite. **Decline** sends a short note instead, with any line you add. Your calendar is untouched until you press one.

Setup is about ten minutes and is described at the top of `meeting-invite.gs`: create the Apps Script project, enable the Calendar API service, set a shared token, deploy it as a web app, then paste the `/exec` URL and the token into `ENDPOINT` and `TOKEN` at the top of `meeting-picker.js`. The spreadsheet creates itself. A static site cannot do any of this on its own — touching your calendar needs something that holds your Google credentials, and that script is it.

If the script is ever unreachable, the picker falls back to the same Google Calendar hand-off, and then to a prefilled email.

To change the bookable hours, meeting length or how far ahead people can book, edit the constants at the top of **both** `meeting-picker.js` and `meeting-invite.gs` — the script is what actually enforces them. To go back to weekdays and office hours, set `ANY_TIME` to `false` in both files; the `WORK_START`/`WORK_END`/`WORK_DAYS` constants under it are what then applies.

To remove the feature entirely, see `REMOVE-MEETING-PICKER.md`.

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
- Wire up `meeting-invite.gs` (about ten minutes) so requests come to you for approval, or leave the picker on its no-setup Google Calendar hand-off.
- Add `assets/resume.pdf`.
