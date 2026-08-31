# Removing the meeting picker

The Apple-clock booking picker in the "Get in touch" section was added as a
self-contained, reversible feature. Removing it takes about a minute and leaves
the contact section exactly as it was — the email, LinkedIn and phone capsules.

## The fast way

```sh
git revert "$(git log --format=%H --grep='^Add a meeting picker to the contact section' -1)"
```

The whole feature is one commit. This is the guaranteed path — it cannot miss
anything. (Looked up by message rather than pinned to a hash, so it survives a
rebase or an amend.) Until that commit exists, use the manual way below.

## The manual way

**1. Delete the feature files.**

```sh
rm meeting-picker.css meeting-picker.js meeting-invite.gs REMOVE-MEETING-PICKER.md
```

**2. Unlink them** in `index.html` — remove the three commented blocks:

```sh
grep -n "\[meeting\]" index.html
```

That lists three sites: the `<link>` in `<head>`, the whole `<div class="mp">`
block under `.contact-links`, and the `<script>` before `script.js`. Delete
each comment along with what it introduces. The `.mp` block ends at the last
`</div>` before `</section>`.

**3. Delete the Apps Script deployment** (only if you set it up). It lives in
your Google account, not the repo: script.google.com → the project →
Deploy → Manage deployments → Archive. Until you do, the endpoint stays live
and answerable, though nothing will be calling it. The **Meeting requests**
sheet in your Drive is the log of everyone who ever asked — keep it or bin it,
nothing reads it once the deployment is gone.

`styles.css`, `script.js`, `glass.js` and `dark-mode.css` were not touched at
all.

---

## Turning on the approval flow

**Out of the box the picker works without any setup**, but the last step is a
hand-off: pressing *Request meeting* opens a prefilled Google Calendar page in
the visitor's tab, they press Save, and Google mails you the invite. It costs
them one extra click, needs them to have a Google account, and no Meet link is
attached automatically.

Wiring up `meeting-invite.gs` takes that off them without handing your calendar
to strangers. The visitor presses one button and is done. What happens then:

1. The request is **held, not booked** — a row in a *Meeting requests* sheet
   that the script creates in your Drive on the first request. The visitor gets
   a short "got it, waiting on confirmation" email so they are not left
   guessing.
2. You get an email: who, when in both timezones, what it is about, and one
   link.
3. That link opens a review page with two buttons. **Approve** creates the
   event with a Google Meet link and lets Google mail them the real invite;
   **Decline** mails them a short note instead, including any line you add.
   Nothing reaches your calendar until you press one.

Setup is about ten minutes and is written at the top of `meeting-invite.gs`:
create a Google Apps Script project, paste that file in, enable the Calendar
API service, set a `SHARED_TOKEN` script property, deploy it as a web app, then
paste the resulting `/exec` URL and the same token into `ENDPOINT` and `TOKEN`
at the top of `meeting-picker.js`. The spreadsheet needs nothing from you.

Nothing else changes. The picker notices the endpoint is set and uses it; if a
request ever fails it falls back to the same Google Calendar hand-off, and
then to a prefilled `mailto:`.

**Why the review link is safe to email.** The request id in it is a UUID, and
the page is the only way to approve anything — there is no approve-on-click
URL that a mail scanner or link prefetcher could trip by accident.

## What it does while it is here

- **Six wheels**, day / month / year and hour / minute / AM-PM, on native
  scroll-snap. Momentum, rubber-banding, trackpad and touch all come from the
  browser's own scroller, which is why it feels right on every platform. The
  iOS look — the curve, the fade at both ends, the single band across each row
  — is `meeting-picker.css`; JS only writes three numbers per visible value.
- **Slot rules.** Any day of the week and any hour of the day, AM or PM, in
  5-minute steps, for a 30-minute meeting — with 15 minutes' notice and a
  365-day horizon as the only two limits. Values that break one are drawn as
  unavailable, and a wheel that lands on one steps to the nearest bookable
  value. Setting `ANY_TIME` to `false` at the top of `meeting-picker.js` **and**
  `meeting-invite.gs` restores weekdays only, 10:00–19:00 IST; those constants
  are still there, sitting under the switch.
- **Timezones.** The visitor picks in their own local time; a line under the
  wheels shows the same slot in IST, and only when the two actually differ.
  What gets sent is the absolute instant, so nothing is lost in translation.
- **Three steps** — slot, then email, then confirmation. Nothing is submitted
  before the visitor presses the button, and with the script wired up nothing
  is booked before you approve it.

## Scope and fallbacks

- Scoped to the `.mp` block in the contact section. Nothing else on the page is
  touched, and no existing selector is overridden.
- **No JavaScript** — the picker does not appear, and the email, LinkedIn and
  phone capsules above it still work.
- **`prefers-reduced-motion`** keeps the curve and the edge fade, which are
  static, and drops the animated open and the smooth programmatic scrolls.
- **Keyboard and screen readers** — each wheel is a listbox with arrow, Page
  and Home/End keys, and a live region announces the composed slot after every
  change.
- Dark mode needs no extra work: the file defines `--mp-*` tokens with
  `--dark-mp-*` counterparts, re-pointed under the same two triggers
  `dark-mode.css` uses.

## Spam, and what bounds it

The endpoint is public — it has to be, the site is static — so anything that
can reach the URL can ask it for a slot. Approval is the real floor: the worst
a flood can do is fill a spreadsheet and your inbox, never your calendar. Under
that, `meeting-invite.gs` re-checks every slot rule server-side (the ones in
`meeting-picker.js` are for the UI and prove nothing), rejects slots that clash
with your real free/busy or with a request already pending, and caps requests
at ten a day overall and five a day from any one address. The shared token sits in
client-side source, so treat it as a speed bump against drive-by posts rather
than a secret — the rate limits are what actually bound a bad day.
