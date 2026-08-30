/**
 * meeting-invite.gs — backend for the meeting picker in the contact section.
 *
 * This file is NOT loaded by the site. It is the source of truth for code that
 * lives in your Google account; paste it into script.google.com and deploy.
 * Keeping it in the repo means the endpoint is reviewable and restorable
 * alongside the front end that calls it.
 *
 * WHY THIS EXISTS
 * A static page cannot create a Calendar event on your account — that needs
 * something holding your Google credentials. This runs as you, so it can, and
 * it is the only place the slot rules are actually enforced. The checks in
 * meeting-picker.js are for the UI; anyone can post straight to this URL.
 *
 * NOTHING IS BOOKED WITHOUT YOU
 * A request from the site is held, not booked. It lands as a row in a
 * "Meeting requests" spreadsheet in your Drive, the guest gets a short "we
 * have it" note, and you get an email with one link. That link opens a review
 * page with two buttons: Approve creates the event with a Google Meet link and
 * lets Google mail the guest the real invite; Decline mails them a short note
 * instead. Your calendar is untouched until you press one.
 *
 * SETUP (once, ~10 minutes)
 *  1. script.google.com → New project. Paste this file over Code.gs.
 *  2. Services (+) → Google Calendar API → Add. This is required: the plain
 *     CalendarApp service cannot attach a Meet link, the advanced one can.
 *  3. Project Settings → Script Properties → add SHARED_TOKEN with a long
 *     random string.
 *  4. Deploy → New deployment → type "Web app",
 *     Execute as: Me, Who has access: Anyone. Authorise when prompted.
 *  5. Copy the /exec URL into ENDPOINT at the top of meeting-picker.js, and
 *     the same token into TOKEN there.
 *
 * The spreadsheet makes itself on the first request — there is nothing to
 * create or paste. It is a normal Sheet in your Drive; open it any time.
 *
 * After any edit here, Deploy → Manage deployments → edit → New version.
 * Deploying a *new deployment* instead changes the URL.
 */

var TZ = 'Asia/Kolkata';
var HOST_EMAIL = '20adityasharan@gmail.com';
var HOST_NAME = 'Aditya Sharan';
var CALENDAR_ID = 'primary';

/* Must match the client. Kept identical on purpose — the front end greys out
   what these reject, and this is what enforces it. */
var DURATION_MIN = 30;

/* Any day, any hour, AM or PM. Set to false to restore the working window and
   weekdays below — and flip ANY_TIME in meeting-picker.js to match, so the UI
   greys out what this would reject. */
var ANY_TIME = true;

/* Read only when ANY_TIME is false. */
var WORK_START_MIN = 10 * 60;
var WORK_END_MIN = 19 * 60;
var WORK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

var HORIZON_DAYS = 1825;
var LEAD_MIN = 15;

/* A public endpoint is a spam surface even when it only writes to a sheet.
   These are the ceiling on how many review emails a bad day can send you. */
var MAX_PER_DAY = 10;
var GUEST_COOLDOWN_H = 24;

/* The request log. Created on first use; its id is remembered in Script
   Properties. Column order is the sheet's contract — rowToRequest() and
   setStatus() index into it, so add new columns at the end. */
var SHEET_NAME = 'Meeting requests';
var SHEET_ID_PROP = 'SHEET_ID';
var HEADERS = ['id', 'requested', 'status', 'when (IST)', 'start (epoch ms)',
               'email', 'name', 'note', 'guest timezone', 'decided', 'event'];

var COL_STATUS = 3;
var COL_START = 5;
var COL_DECIDED = 10;
var COL_EVENT = 11;

/* -------------------------------------------------------------------------- */
/* The site posts here                                                        */
/* -------------------------------------------------------------------------- */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.company) return reply(false, 'Rejected.');            // honeypot
    if (body.token !== token()) return reply(false, 'Rejected.');

    var email = String(body.email || '').trim();
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      return reply(false, 'That email address does not look right.');
    }

    var start = new Date(body.startIso);
    if (isNaN(start.getTime())) return reply(false, 'Bad date.');
    var end = new Date(start.getTime() + DURATION_MIN * 60000);

    var reason = checkSlot(start);
    if (reason) return reply(false, reason);

    var id;
    /* Serialised: two people submitting the same slot a second apart would
       otherwise both pass the checks below. */
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var limited = checkLimits(email);
      if (limited) return reply(false, limited);
      if (isBusy(start, end) || isHeld(start, end)) {
        return reply(false, 'That slot just filled — please pick another.');
      }

      id = Utilities.getUuid();
      addRequest(id, start, email, body);
      recordBooking(email);
    } finally {
      lock.releaseLock();
    }

    /* Mail is slow and can fail on its own (quota, transient), so it happens
       outside the lock and cannot fail the request: the row is already the
       record. A missing email means you review it in the sheet instead. */
    try { notifyHost(id, start, email, body); } catch (err) { console.error(err); }
    try { ackGuest(start, email, body); } catch (err) { console.error(err); }

    return reply(true, null, { pending: true });

  } catch (err) {
    /* Logged rather than returned: an exception message can name internal
       details, and the picker only needs to know it failed. */
    console.error(err);
    return reply(false, 'Could not send that request. Please try again.');
  }
}

/**
 * With no id: a health check, so the deployment can be confirmed in a browser.
 * With one: the review page for that request — the link in your email.
 */
function doGet(e) {
  var id = e && e.parameter ? e.parameter.id : null;
  if (!id) return reply(true, null, { service: 'meeting-invite', ok: true });
  return reviewPage(String(id));
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

function token() {
  return PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
}

/** The same rules as checkSlot() in meeting-picker.js, evaluated in IST. */
function checkSlot(start) {
  var now = Date.now();
  if (start.getTime() < now + LEAD_MIN * 60000) return 'That slot is too soon.';
  if (start.getTime() > now + HORIZON_DAYS * 86400000) return 'That is too far ahead.';

  /* Every day and every hour is bookable while ANY_TIME holds; notice, the
     horizon, the freebusy check and the caps below are the only limits. */
  if (ANY_TIME) return null;

  /* Utilities.formatDate, not Intl — Apps Script's Intl support is partial,
     and this is the platform's own timezone-aware formatter. */
  var day = Utilities.formatDate(start, TZ, 'EEE');
  if (WORK_DAYS.indexOf(day) === -1) return 'Weekends are not bookable.';

  var minutes = Number(Utilities.formatDate(start, TZ, 'HH')) * 60 +
                Number(Utilities.formatDate(start, TZ, 'mm'));
  if (minutes < WORK_START_MIN || minutes + DURATION_MIN > WORK_END_MIN) {
    return 'Outside working hours (10:00-19:00 IST).';
  }
  return null;
}

function checkLimits(email) {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

  if (Number(props.getProperty('count:' + today) || 0) >= MAX_PER_DAY) {
    return 'Today is fully booked — try tomorrow.';
  }

  var last = Number(props.getProperty('guest:' + email.toLowerCase()) || 0);
  if (last && Date.now() - last < GUEST_COOLDOWN_H * 3600000) {
    return 'You already have a request in. Reply to that email to change it.';
  }
  return null;
}

function clearCooldown(email) {
  PropertiesService.getScriptProperties()
    .deleteProperty('guest:' + String(email).toLowerCase());
}

function recordBooking(email) {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  props.setProperty('count:' + today,
    String(Number(props.getProperty('count:' + today) || 0) + 1));
  props.setProperty('guest:' + email.toLowerCase(), String(Date.now()));
}

function isBusy(start, end) {
  var fb = Calendar.Freebusy.query({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    items: [{ id: CALENDAR_ID }]
  });
  var cal = fb.calendars[CALENDAR_ID];
  return !!(cal && cal.busy && cal.busy.length);
}

/**
 * A pending request holds its slot. Without this, two visitors can both ask
 * for 5pm Thursday and one gets a decline for no reason of their own — the
 * freebusy check above only sees events, and a pending request is not one.
 * Pending rows whose slot has already passed are ignored: they were never
 * acted on, and they should not block a slot forever.
 */
function isHeld(start, end) {
  var rows = allRows();
  var now = Date.now();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL_STATUS - 1]) !== 'pending') continue;
    var s = Number(rows[i][COL_START - 1]);
    if (!s) continue;
    var e = s + DURATION_MIN * 60000;
    if (e < now) continue;
    if (s < end.getTime() && e > start.getTime()) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* The request log                                                            */
/* -------------------------------------------------------------------------- */

function sheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SHEET_ID_PROP);
  if (id) {
    try {
      return SpreadsheetApp.openById(id).getSheets()[0];
    } catch (err) {
      /* Trashed or unshared. Fall through and make a new one rather than
         failing every request from here on. */
      console.error(err);
    }
  }
  var ss = SpreadsheetApp.create(SHEET_NAME);
  var sh = ss.getSheets()[0];
  sh.appendRow(HEADERS);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  props.setProperty(SHEET_ID_PROP, ss.getId());
  return sh;
}

function allRows() {
  var sh = sheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

/* The instant is stored as epoch milliseconds, not as an ISO string: Sheets
   silently parses anything date-shaped into its own Date in the sheet's
   timezone, and reading that back is how a booking ends up an hour out. */
function addRequest(id, start, email, body) {
  sheet().appendRow([
    id,
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
    'pending',
    Utilities.formatDate(start, TZ, 'EEE d MMM yyyy, h:mm a'),
    start.getTime(),
    email,
    String(body.name || ''),
    String(body.note || ''),
    String(body.tz || ''),
    '',
    ''
  ]);
}

function findRequest(id) {
  var rows = allRows();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      return { row: i + 2, data: rowToRequest(rows[i]) };
    }
  }
  return null;
}

function rowToRequest(v) {
  return {
    id: String(v[0]),
    status: String(v[2]),
    whenLabel: String(v[3]),
    startMs: Number(v[4]),
    email: String(v[5]),
    name: String(v[6]),
    note: String(v[7]),
    tz: String(v[8]),
    link: String(v[10])
  };
}

function setStatus(row, status, link) {
  var sh = sheet();
  sh.getRange(row, COL_STATUS).setValue(status);
  sh.getRange(row, COL_DECIDED).setValue(
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
  if (link) sh.getRange(row, COL_EVENT).setValue(link);
}

/* -------------------------------------------------------------------------- */
/* Approve / decline                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Called by the review page over google.script.run, which runs it as you.
 * The request id is the only thing guarding it, so it is a UUID and the link
 * that carries it only ever goes to your inbox.
 */
function decide(id, decision, message) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findRequest(String(id));
    if (!found) return { ok: false, error: 'That request no longer exists.' };

    var r = found.data;
    if (r.status !== 'pending') {
      return { ok: false, error: 'This one was already ' + r.status + '.' };
    }

    var start = new Date(r.startMs);
    var end = new Date(r.startMs + DURATION_MIN * 60000);

    if (decision === 'approve') {
      /* Re-checked, not trusted: this sat in your inbox for a while, and the
         slot may have passed or been taken since. */
      var reason = checkSlot(start);
      if (reason) {
        return { ok: false, error: reason + ' Decline it and they can pick another.' };
      }
      if (isBusy(start, end)) {
        return { ok: false, error: 'You are busy then — that slot filled while this was pending.' };
      }

      var event = createEvent(start, end, r.email, r);
      setStatus(found.row, 'approved', event.htmlLink);
      return {
        ok: true,
        message: 'Approved. The invite and the Meet link are on their way to ' + r.email + '.',
        link: event.htmlLink
      };
    }

    if (decision === 'decline') {
      setStatus(found.row, 'declined', '');
      /* You just asked them to try another time, so do not also make them wait
         a day for it. Approving leaves the cooldown in place. */
      clearCooldown(r.email);
      try { declineGuest(r, message); } catch (err) { console.error(err); }
      return { ok: true, message: 'Declined. ' + r.email + ' has been told.' };
    }

    return { ok: false, error: 'Unknown action.' };

  } catch (err) {
    console.error(err);
    return { ok: false, error: 'That did not go through. Try again.' };
  } finally {
    lock.releaseLock();
  }
}

function createEvent(start, end, email, r) {
  var guest = r.name ? r.name : email;
  return Calendar.Events.insert({
    summary: HOST_NAME + ' × ' + guest,
    description: (r.note ? r.note + '\n\n' : '') +
      'Booked from ' + HOST_NAME + "'s site." +
      (r.tz ? '\nGuest timezone: ' + r.tz : ''),
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
    attendees: [{ email: email }],
    /* This is the whole reason for the advanced service: it asks Google to
       mint a Meet link and attach it to the event. */
    conferenceData: {
      createRequest: {
        requestId: Utilities.getUuid(),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  }, CALENDAR_ID, {
    conferenceDataVersion: 1,
    /* Makes Google email the guest the real invite, with the Meet link and
       accept / decline / propose-new-time buttons. */
    sendUpdates: 'all'
  });
}

/* -------------------------------------------------------------------------- */
/* Mail                                                                       */
/* -------------------------------------------------------------------------- */

function notifyHost(id, start, email, body) {
  var when = Utilities.formatDate(start, TZ, 'EEE d MMM, h:mm a') + ' IST';
  MailApp.sendEmail({
    to: HOST_EMAIL,
    subject: 'Meeting request: ' + (body.name || email) + ' — ' + when,
    body: [
      (body.name || 'Someone') + ' asked for a ' + DURATION_MIN + '-minute call.',
      '',
      'When:  ' + when + (body.tz ? '  (their timezone: ' + body.tz + ')' : ''),
      'Email: ' + email,
      'About: ' + (body.note || '—'),
      '',
      'Nothing is on your calendar yet. Open this to approve or decline:',
      reviewUrl(id),
      '',
      'Approving creates the event with a Google Meet link and mails them the',
      'invite. Declining sends a short note instead.'
    ].join('\n')
  });
}

/** So the guest is not left staring at silence while it waits on you. */
function ackGuest(start, email, body) {
  MailApp.sendEmail({
    to: email,
    name: HOST_NAME,
    replyTo: HOST_EMAIL,
    subject: 'Got your meeting request — ' + HOST_NAME,
    body: [
      greeting(body.name),
      '',
      'Thanks for asking for a ' + DURATION_MIN + '-minute call on ' +
        guestWhen(start, body.tz) + '.',
      '',
      'I confirm these by hand, so give me a little while. Once I do, a Google',
      'Calendar invite with a Meet link lands in this inbox. If the time no',
      'longer works, just reply here.',
      '',
      '— ' + HOST_NAME
    ].join('\n')
  });
}

function declineGuest(r, message) {
  var note = String(message || '').trim();
  MailApp.sendEmail({
    to: r.email,
    name: HOST_NAME,
    replyTo: HOST_EMAIL,
    subject: 'About your meeting request — ' + HOST_NAME,
    body: [
      greeting(r.name),
      '',
      'Thanks for the request for ' + guestWhen(new Date(r.startMs), r.tz) +
        '. I cannot make that one.',
      '',
      note ? note + '\n' : '',
      'Reply here and we will find a time that works.',
      '',
      '— ' + HOST_NAME
    ].join('\n')
  });
}

/**
 * The name a stranger typed, going back out over your own Gmail. Anything that
 * is not name-shaped — a URL, a line of markup — is dropped, so the endpoint
 * cannot be used as a ten-a-day relay for someone else's text. Your own copy
 * of the request (notifyHost) keeps the raw value.
 */
function greeting(name) {
  var first = safeName(name).split(' ')[0];
  return first ? 'Hi ' + first + ',' : 'Hi,';
}

function safeName(name) {
  var clean = String(name || '').replace(/[^\p{L}\p{M}'\- ]/gu, '').trim();
  return clean ? clean.slice(0, 40) : '';
}

/** The slot in the guest's own timezone, falling back to IST. */
function guestWhen(start, tz) {
  if (tz) {
    try {
      return Utilities.formatDate(start, tz, 'EEE d MMM, h:mm a') + ' (' + tz + ')';
    } catch (err) {
      /* An unknown timezone string from an old browser. */
    }
  }
  return Utilities.formatDate(start, TZ, 'EEE d MMM, h:mm a') + ' IST';
}

function reviewUrl(id) {
  return ScriptApp.getService().getUrl() + '?id=' + encodeURIComponent(id);
}

/* -------------------------------------------------------------------------- */
/* The review page                                                            */
/* -------------------------------------------------------------------------- */

function reviewPage(id) {
  var found = findRequest(id);
  if (!found) {
    return page('Meeting request',
      '<h1>Nothing here</h1>' +
      '<p class="muted">That link does not match a request. It may have been ' +
      'deleted from the sheet.</p>');
  }

  var r = found.data;
  var start = new Date(r.startMs);

  var rows =
    field('Who', esc(r.name || '—')) +
    field('Email', '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>') +
    field('When', esc(r.whenLabel) + ' IST') +
    (r.tz ? field('Their time', esc(guestWhen(start, r.tz))) : '') +
    field('About', esc(r.note || '—')) +
    field('Length', DURATION_MIN + ' minutes');

  if (r.status !== 'pending') {
    return page('Meeting request',
      '<h1>Already ' + esc(r.status) + '</h1>' +
      '<dl>' + rows + '</dl>' +
      (r.link ? '<p><a class="link" href="' + esc(r.link) + '">Open the event</a></p>' : ''));
  }

  /* Surfaced rather than enforced here — decide() re-checks both before it
     writes anything. This is so you are not surprised by the failure. */
  var problem = checkSlot(start);
  if (!problem && isBusy(start, new Date(r.startMs + DURATION_MIN * 60000))) {
    problem = 'You already have something on then.';
  }

  var first = (r.name ? esc(r.name.split(' ')[0]) : 'them');

  return page('Meeting request',
    '<h1>Meeting request</h1>' +
    '<dl>' + rows + '</dl>' +
    (problem ? '<p class="warn">' + esc(problem) + '</p>' : '') +
    '<label for="msg">A line back to ' + first +
      ' <span class="muted">(optional, sent with a decline)</span></label>' +
    '<textarea id="msg" rows="3" placeholder="That week is packed — try the one after?"></textarea>' +
    '<div class="row">' +
      '<button id="yes" class="go">Approve &amp; send the invite</button>' +
      '<button id="no" class="ghost">Decline</button>' +
    '</div>' +
    '<p id="out" class="out" role="status"></p>' +
    '<script>(function () {' +
      'var id = ' + JSON.stringify(id) + ';' +
      'var yes = document.getElementById("yes");' +
      'var no = document.getElementById("no");' +
      'var out = document.getElementById("out");' +
      'function run(decision) {' +
        'yes.disabled = no.disabled = true;' +
        'out.className = "out";' +
        'out.textContent = decision === "approve" ? "Creating the event…" : "Sending…";' +
        'google.script.run' +
          '.withSuccessHandler(function (res) {' +
            'if (res && res.ok) {' +
              'out.className = "out good";' +
              'out.textContent = res.message;' +
              'if (res.link) {' +
                'var a = document.createElement("a");' +
                'a.href = res.link; a.className = "link"; a.textContent = "Open the event";' +
                'out.appendChild(document.createElement("br")); out.appendChild(a);' +
              '}' +
            '} else {' +
              'out.className = "out bad";' +
              'out.textContent = (res && res.error) || "That did not go through.";' +
              'yes.disabled = no.disabled = false;' +
            '}' +
          '})' +
          '.withFailureHandler(function (err) {' +
            'out.className = "out bad";' +
            'out.textContent = err && err.message ? err.message : "That did not go through.";' +
            'yes.disabled = no.disabled = false;' +
          '})' +
          '.decide(id, decision, document.getElementById("msg").value);' +
      '}' +
      'yes.onclick = function () { run("approve"); };' +
      'no.onclick = function () { run("decline"); };' +
    '}());<\/script>');
}

function field(label, valueHtml) {
  return '<dt>' + label + '</dt><dd>' + valueHtml + '</dd>';
}

function page(title, bodyHtml) {
  var html = HtmlService.createHtmlOutput(
    '<style>' + PAGE_CSS + '</style><main class="card">' + bodyHtml + '</main>');
  html.setTitle(title);
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return html;
}

var PAGE_CSS = [
  ':root{color-scheme:light dark;--bg:#f6f6f7;--card:#fff;--ink:#16171a;--muted:#6b6d76;--line:#e4e4e8;--go:#1f6feb;--bad:#b3261e;--good:#1a7f37}',
  '@media (prefers-color-scheme:dark){:root{--bg:#16171a;--card:#1e1f24;--ink:#f2f2f4;--muted:#9a9ca5;--line:#2e3038;--go:#4c8dff;--bad:#ff8a80;--good:#5cc97a}}',
  '*{box-sizing:border-box}',
  'body{margin:0;padding:24px;background:var(--bg);color:var(--ink);',
  'font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
  '.card{max-width:34rem;margin:0 auto;background:var(--card);border:1px solid var(--line);',
  'border-radius:14px;padding:24px}',
  'h1{margin:0 0 18px;font-size:20px;letter-spacing:-.01em}',
  'dl{display:grid;grid-template-columns:7rem 1fr;gap:8px 16px;margin:0 0 20px}',
  'dt{color:var(--muted)}dd{margin:0}',
  'a{color:var(--go)}',
  '.muted{color:var(--muted)}',
  '.warn{margin:0 0 18px;padding:10px 12px;border-radius:9px;background:rgba(179,38,30,.1);color:var(--bad)}',
  'label{display:block;margin:0 0 6px;color:var(--muted)}',
  'textarea{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;',
  'background:var(--bg);color:var(--ink);font:inherit;resize:vertical}',
  '.row{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}',
  'button{font:inherit;padding:10px 16px;border-radius:9px;border:1px solid transparent;cursor:pointer}',
  'button:disabled{opacity:.5;cursor:default}',
  '.go{background:var(--go);color:#fff}',
  '.ghost{background:transparent;color:var(--ink);border-color:var(--line)}',
  '.out{margin:16px 0 0;min-height:1.5em}',
  '.out.good{color:var(--good)}.out.bad{color:var(--bad)}',
  '.link{display:inline-block;margin-top:6px}'
].join('');

/* -------------------------------------------------------------------------- */

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reply(ok, error, extra) {
  var payload = { ok: ok };
  if (error) payload.error = error;
  if (extra) for (var k in extra) payload[k] = extra[k];
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
