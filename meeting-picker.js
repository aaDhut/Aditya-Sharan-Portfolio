/* ==========================================================================
   Meeting picker — Apple-clock wheels, slot rules, and the booking submit
   ==========================================================================

   Self-contained and removable: see REMOVE-MEETING-PICKER.md.

   Reads the markup shell in index.html (all copy lives there) and fills in
   the six wheel columns, which are generated rather than authored: days per
   month and the year range depend on today's date.

   Everything visual is meeting-picker.css. This file writes three numbers per
   visible item — --r, --s, --o — and lets CSS composite them.
   ========================================================================== */

(function () {
  'use strict';

  /* ---- Configuration ---------------------------------------------------- */

  /* Paste the Apps Script /exec URL here to turn on the approval flow: the
     request is held, Aditya gets a review link, and approving is what creates
     the event and mails the Meet invite. While this is empty, Send opens a
     prefilled Google Calendar page instead — see the fallback in submit().
     Setup steps: REMOVE-MEETING-PICKER.md. */
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzCQShwR3SIzzJ6Wn8-9zncTocOZyh8onHg37vISukeINGTa2bO5RfBv5X7YJ4-SI-d/exec';

  /* Must match the SHARED_TOKEN script property in meeting-invite.gs. It sits
     in client-side source, so it is a speed bump against drive-by posts, not
     a secret — the rate limits and the freebusy check in the script are what
     actually bound the damage. */
  var TOKEN = 'Rx0L0V_jQGBcURG8J_pivBJFWEACHYoNa1c1svjDNpk';

  var HOST_NAME = 'Aditya Sharan';
  var HOST_EMAIL = 'aadhut10@gmail.com';
  var HOST_TZ = 'Asia/Kolkata';

  var DURATION_MIN = 30;

  /* The rule meeting-invite.gs enforces, repeated here so the visitor hears
     about it immediately. Deliberately stricter than type="email", which
     accepts a dotless domain like "you@gmail". */
  var EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

  /* Any day of the week, any hour of the day, AM or PM. Set this to false to
     go back to a working window and weekdays only — one switch here and the
     matching one in meeting-invite.gs, which is what actually enforces it. */
  var ANY_TIME = true;

  /* Read only when ANY_TIME is false. Working window in IST: a 30-minute
     meeting must finish by WORK_END, so the last bookable start is 18:30. */
  var WORK_START_H = 10;
  var WORK_END_H = 19;
  var WORK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  /* Granularity of the minute wheel — 5 gives every :00, :05, :10 … :55. */
  var STEP_MIN = 5;
  /* How far ahead the wheels open. Must match HORIZON_DAYS in
     meeting-invite.gs, which is the copy that actually refuses a booking. */
  var HORIZON_DAYS = 1825;
  /* Minimum notice, so nobody books a call starting four minutes from now. */
  var LEAD_MIN = 15;

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var root = document.querySelector('.mp');
  if (!root) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var localTz = 'your timezone';
  try {
    localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || localTz;
  } catch (e) { /* very old browser; the label just stays generic */ }

  /* One formatter, reused. Constructing an Intl.DateTimeFormat costs far more
     than calling it, and with ANY_TIME off validation calls it ~60 times per
     settle. */
  var istFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOST_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  var istLabelFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOST_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  /* Same options, local zone. Comparing what these two *print* is how the
     summary decides whether the IST line is worth showing: browsers report
     Asia/Calcutta and Asia/Kolkata interchangeably for the same place, so a
     string compare on the zone name would show an Indian visitor the same
     time twice. */
  var localLabelFmt = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  /* ---- Time helpers ------------------------------------------------------ */

  function istOf(date) {
    var parts = istFmt.formatToParts(date);
    var out = {};
    for (var i = 0; i < parts.length; i++) out[parts[i].type] = parts[i].value;
    return {
      weekday: out.weekday,
      minutes: parseInt(out.hour, 10) * 60 + parseInt(out.minute, 10)
    };
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /* The single source of truth for whether a slot can be booked. The client
     copy is for the UI; meeting-invite.gs runs the same rules server-side,
     which are the ones that count. */
  function checkSlot(date) {
    if (!date || isNaN(date.getTime())) return 'That date does not exist.';

    var now = Date.now();
    if (date.getTime() < now + LEAD_MIN * 60000) {
      return 'Pick a slot at least ' + LEAD_MIN + ' minutes from now.';
    }
    if (date.getTime() > now + HORIZON_DAYS * 86400000) {
      return 'Bookings open ' + HORIZON_DAYS + ' days ahead.';
    }

    /* Nothing below runs while ANY_TIME holds: every day and every hour is
       bookable, and notice and horizon are the only two limits left. */
    if (ANY_TIME) return null;

    var ist = istOf(date);
    if (WORK_DAYS.indexOf(ist.weekday) === -1) {
      return 'That falls on a weekend in ' + HOST_NAME.split(' ')[0] + "'s timezone.";
    }
    if (ist.minutes < WORK_START_H * 60 ||
        ist.minutes + DURATION_MIN > WORK_END_H * 60) {
      return 'Outside working hours (' + pad(WORK_START_H) + ':00–' +
        pad(WORK_END_H) + ':00 IST).';
    }
    return null;
  }

  /* ---- Wheel ------------------------------------------------------------- */

  /* A column of values on native scroll-snap. The <li> is never transformed —
     scroll snap measures its snap area from that box, so rotating it would
     move the value the browser snaps to. The <span> inside carries the
     curve. */
  function Wheel(el, key, onSettle) {
    var list = document.createElement('ul');
    list.className = 'mp-list';
    el.appendChild(list);

    el.setAttribute('role', 'listbox');
    el.setAttribute('tabindex', '0');

    var items = [];        // { value, label, invalid, li, span }
    var index = 0;
    var painted = [0, -1]; // range last given depth values, so it can be cleared
    var rafPending = false;
    var settleTimer = null;
    var itemH = 40;

    function measure() {
      if (items.length) itemH = items[0].li.offsetHeight || itemH;
      return itemH;
    }

    function paint() {
      rafPending = false;
      var h = measure();
      if (!h) return;
      var centre = el.scrollTop / h;
      var lo = Math.max(0, Math.floor(centre) - 3);
      var hi = Math.min(items.length - 1, Math.ceil(centre) + 3);

      for (var i = painted[0]; i <= painted[1]; i++) {
        if ((i < lo || i > hi) && items[i]) {
          items[i].span.style.cssText = '';
        }
      }

      for (var j = lo; j <= hi; j++) {
        var d = j - centre;
        var a = Math.min(Math.abs(d), 3);
        var s = items[j].span.style;
        /* ±26° per row away from centre: at the edge of a five-row window the
           value is turned far enough to read as running off a drum, without
           collapsing into an unreadable sliver. */
        s.setProperty('--r', (d * 26).toFixed(2));
        s.setProperty('--s', (1 - a * 0.085).toFixed(3));
        s.setProperty('--o', Math.max(0, 1 - a * 0.32).toFixed(3));
      }
      painted = [lo, hi];
    }

    function currentIndex() {
      var h = measure();
      return h ? Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / h))) : 0;
    }

    function settle() {
      var next = currentIndex();
      if (next !== index) {
        setActive(next);
      }
      onSettle(key);
    }

    function setActive(i) {
      if (items[index]) items[index].li.setAttribute('aria-selected', 'false');
      index = i;
      if (items[index]) {
        items[index].li.setAttribute('aria-selected', 'true');
        el.setAttribute('aria-activedescendant', items[index].li.id);
      }
    }

    el.addEventListener('scroll', function () {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(paint);
      }
      if (!hasScrollEnd) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 140);
      }
    }, { passive: true });

    var hasScrollEnd = 'onscrollend' in window;
    if (hasScrollEnd) el.addEventListener('scrollend', settle);

    /* Click-to-select. The band is the only place a value can end up, so a
       click anywhere else in the column is a request to bring that value
       there — the same move ArrowUp/ArrowDown makes, so it goes through
       select() and settles exactly as a scroll would — an unavailable value
       included, since refusing the click there is just a dead end. */
    el.addEventListener('click', function (ev) {
      var li = ev.target.closest('.mp-item');
      if (!li) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].li === li) {
          if (i !== index) api.select(i, true);
          break;
        }
      }
    });

    el.addEventListener('keydown', function (ev) {
      var step = 0;
      if (ev.key === 'ArrowUp') step = -1;
      else if (ev.key === 'ArrowDown') step = 1;
      else if (ev.key === 'PageUp') step = -5;
      else if (ev.key === 'PageDown') step = 5;
      else if (ev.key === 'Home') step = -items.length;
      else if (ev.key === 'End') step = items.length;
      else return;
      ev.preventDefault();
      api.select(Math.max(0, Math.min(items.length - 1, index + step)), true);
    });

    var api = {
      el: el,

      /* Rebuilds the column, keeping the current value selected when it
         survives the new list (the day wheel is rebuilt every time the month
         changes, and 14 September should stay 14 October). */
      setOptions: function (next) {
        var keep = items[index] ? items[index].value : null;
        list.textContent = '';
        items = next.map(function (opt, i) {
          var li = document.createElement('li');
          li.className = 'mp-item';
          li.id = 'mp-' + key + '-' + i;
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', 'false');
          var span = document.createElement('span');
          span.textContent = opt.label;
          li.appendChild(span);
          list.appendChild(li);
          return { value: opt.value, label: opt.label, li: li, span: span };
        });
        painted = [0, -1];
        var at = 0;
        for (var i = 0; i < items.length; i++) {
          if (items[i].value === keep) { at = i; break; }
        }
        index = -1;
        api.select(at, false);
      },

      select: function (i, smooth) {
        if (!items.length) return;
        i = Math.max(0, Math.min(items.length - 1, i));
        setActive(i);
        el.scrollTo({
          top: i * measure(),
          behavior: smooth && !reduceMotion ? 'smooth' : 'auto'
        });
        paint();
      },

      value: function () {
        return items[index] ? items[index].value : null;
      },

      indexOfValue: function (v) {
        for (var i = 0; i < items.length; i++) if (items[i].value === v) return i;
        return -1;
      },

      /* `test` returns true for a bookable value. Invalid ones stay in the
         column — you cannot stop snap landing on one — but they are drawn as
         unavailable and the wheel steps off them on settle. */
      mark: function (test) {
        for (var i = 0; i < items.length; i++) {
          items[i].invalid = !test(items[i].value);
          items[i].li.classList.toggle('is-invalid', items[i].invalid);
        }
      },

      /* Nearest bookable value to where the wheel currently sits, searching
         outward in both directions. Null when the whole column is unavailable
         (every day of a month already past, say). */
      nearestValid: function () {
        if (!items[index] || !items[index].invalid) return null;
        for (var d = 1; d < items.length; d++) {
          if (items[index - d] && !items[index - d].invalid) return index - d;
          if (items[index + d] && !items[index + d].invalid) return index + d;
        }
        return -1;
      },

      repaint: paint
    };

    return api;
  }

  /* ---- Wiring ------------------------------------------------------------ */

  var toggle = root.querySelector('.mp-toggle');
  var stepPick = root.querySelector('[data-step="pick"]');
  var stepDetails = root.querySelector('[data-step="details"]');
  var stepDone = root.querySelector('[data-step="done"]');
  var summary = root.querySelector('.mp-summary');
  var note = root.querySelector('.mp-note');
  var live = root.querySelector('.mp-sr');
  var nextBtn = root.querySelector('[data-action="next"]');
  var backBtns = root.querySelectorAll('[data-action="back"]');
  var sendBtn = root.querySelector('[data-action="send"]');
  /* Read once, restored after a send: the label is authored in index.html
     with the rest of the copy, and should only live there. */
  var sendLabel = sendBtn.textContent;
  var form = root.querySelector('.mp-form');
  var emailInput = root.querySelector('#mp-email');
  var nameInput = root.querySelector('#mp-name');
  var noteInput = root.querySelector('#mp-note');
  var hpInput = root.querySelector('#mp-company');
  var doneTitle = root.querySelector('.mp-done h3');
  var doneBody = root.querySelector('.mp-done p');

  var today = new Date();
  var horizon = new Date(today.getTime() + HORIZON_DAYS * 86400000);
  /* Every year the horizon reaches, not just its two ends — a horizon over
     two years long would otherwise offer 2026 and 2028 and skip 2027. */
  var years = [];
  for (var y = today.getFullYear(); y <= horizon.getFullYear(); y++) years.push(y);

  var wheels = {};
  ['day', 'month', 'year', 'hour', 'minute', 'ampm'].forEach(function (key) {
    var el = root.querySelector('[data-wheel="' + key + '"]');
    wheels[key] = Wheel(el, key, onWheelSettle);
  });

  wheels.month.setOptions(MONTHS.map(function (label, i) {
    return { value: i, label: label };
  }));
  wheels.year.setOptions(years.map(function (y) {
    return { value: y, label: String(y) };
  }));
  wheels.hour.setOptions(Array.from({ length: 12 }, function (_, i) {
    return { value: i + 1, label: pad(i + 1) };
  }));
  wheels.minute.setOptions(
    Array.from({ length: Math.floor(60 / STEP_MIN) }, function (_, i) {
      return { value: i * STEP_MIN, label: pad(i * STEP_MIN) };
    })
  );
  wheels.ampm.setOptions([
    { value: 'AM', label: 'AM' },
    { value: 'PM', label: 'PM' }
  ]);
  rebuildDays();

  function rebuildDays() {
    var y = wheels.year.value() || today.getFullYear();
    var m = wheels.month.value();
    if (m === null) m = today.getMonth();
    var n = daysInMonth(y, m);
    wheels.day.setOptions(Array.from({ length: n }, function (_, i) {
      return { value: i + 1, label: pad(i + 1) };
    }));
  }

  /* Compose the six columns into a local-time Date. */
  function selected(over) {
    over = over || {};
    var h12 = pick(over, 'hour');
    var ampm = pick(over, 'ampm');
    var h24 = (h12 % 12) + (ampm === 'PM' ? 12 : 0);
    return new Date(
      pick(over, 'year'),
      pick(over, 'month'),
      pick(over, 'day'),
      h24,
      pick(over, 'minute'),
      0, 0
    );
  }

  function pick(over, key) {
    return Object.prototype.hasOwnProperty.call(over, key) ? over[key] : wheels[key].value();
  }

  /* The half-open interval a coarse value covers, against the rest of the
     current selection. Null for a day the candidate month does not have. */
  function spanOf(key, v) {
    var y = wheels.year.value() || today.getFullYear();
    var m = wheels.month.value();
    if (key === 'year') return [new Date(v, 0, 1), new Date(v + 1, 0, 1)];
    if (key === 'month') return [new Date(y, v, 1), new Date(y, v + 1, 1)];
    if (v > daysInMonth(y, m)) return null;
    return [new Date(y, m, v), new Date(y, m, v + 1)];
  }

  /* A day, a month, a year covers many slots, so it is available when ANY
     slot inside it is — which for notice and horizon is an interval overlap,
     no scanning. Testing one instant instead is what greyed out the whole of
     August because the day wheel happened to sit on the 1st, and the whole of
     2027 because the month wheel happened to sit on September. */
  function unitBookable(key, v) {
    var span = spanOf(key, v);
    if (!span) return false;

    var now = Date.now();
    if (span[1].getTime() <= now + LEAD_MIN * 60000) return false;
    if (span[0].getTime() > now + HORIZON_DAYS * 86400000) return false;

    /* A weekend is the one rule that can empty a whole unit, and only a day —
       every month and every year contains a working day. */
    if (!ANY_TIME && key === 'day') {
      return WORK_DAYS.indexOf(istOf(new Date(span[0].getTime() + 12 * 3600000)).weekday) !== -1;
    }
    return true;
  }

  /* Mark every column against the current selection: the coarse wheels by the
     span they cover, the time wheels one value at a time — which for those is
     exact, since a minute is the finest thing bookable. */
  function markAll() {
    Object.keys(wheels).forEach(function (key) {
      wheels[key].mark(function (v) {
        if (key === 'day' || key === 'month' || key === 'year') {
          return unitBookable(key, v);
        }
        var over = {};
        over[key] = v;
        return checkSlot(selected(over)) === null;
      });
    });
  }

  var lastGood = null;

  /* Which column to move when the value that just landed is itself fine but
     the combination is not — a year whose current month is past the horizon,
     a month whose current day has already gone. Coarse first: moving the
     month to reach a bookable slot is a smaller surprise than moving the
     minute out from under someone who just set it. */
  var CASCADE = ['year', 'month', 'day', 'ampm', 'hour', 'minute'];

  /* Each correction settles the wheel it moves, which re-enters here. The
     count bounds that chain; any settle that needs no correction clears it. */
  var corrections = 0;

  function onWheelSettle(key) {
    if (key === 'month' || key === 'year') rebuildDays();

    var reason = checkSlot(selected());
    if (reason && corrections < 6) {
      markAll();

      /* Step the wheel that just moved onto its nearest bookable value. */
      var to = wheels[key].nearestValid();
      if (to !== null && to >= 0) {
        corrections++;
        wheels[key].select(to, true);
        return;
      }

      /* null means that value is bookable somewhere — August is, on the 31st —
         so the column holding the slot back is one of the others. Move that
         one instead, and a click on August lands on a day in August rather
         than on a dead warning. */
      if (to === null) {
        for (var i = 0; i < CASCADE.length; i++) {
          if (CASCADE[i] === key) continue;
          var at = wheels[CASCADE[i]].nearestValid();
          if (at !== null && at >= 0) {
            corrections++;
            wheels[CASCADE[i]].select(at, true);
            return;
          }
        }
      }
      /* Nothing left to move: the reason stays on screen and Next stays
         disabled rather than the picker jumping somewhere arbitrary. */
    }

    corrections = 0;
    render();
  }

  function render() {
    markAll();
    var date = selected();
    var reason = checkSlot(date);

    if (reason) {
      summary.innerHTML = '';
      note.textContent = reason;
      note.setAttribute('data-tone', 'warn');
      nextBtn.disabled = true;
      return;
    }

    lastGood = date;
    var end = new Date(date.getTime() + DURATION_MIN * 60000);
    var localLine = date.toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short'
    }) + ' · ' + timeLabel(date) + ' – ' + timeLabel(end);

    summary.innerHTML = '';
    var strong = document.createElement('b');
    strong.textContent = localLine;
    summary.appendChild(strong);

    /* A visitor whose clock already reads IST does not need it twice. */
    if (istLabelFmt.format(date) !== localLabelFmt.format(date)) {
      var small = document.createElement('small');
      small.textContent = 'Your time (' + localTz + ') — ' +
        istLabelFmt.format(date) + ' IST for ' + HOST_NAME.split(' ')[0];
      summary.appendChild(small);
    }

    note.textContent = DURATION_MIN + '-minute call over Google Meet' +
      (ANY_TIME ? ' \u2014 any day, any time.' : '.');
    note.removeAttribute('data-tone');
    nextBtn.disabled = false;
    live.textContent = 'Selected ' + localLine;
  }

  function timeLabel(d) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /* Open on a slot that is already bookable, so the picker never greets
     anyone with an error. Walks forward in STEP_MIN increments from the
     earliest permitted start. */
  function firstOpenSlot() {
    var d = new Date(Date.now() + LEAD_MIN * 60000);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / STEP_MIN) * STEP_MIN);
    var limit = (HORIZON_DAYS * 24 * 60) / STEP_MIN;
    for (var i = 0; i < limit; i++) {
      if (checkSlot(d) === null) return d;
      d = new Date(d.getTime() + STEP_MIN * 60000);
    }
    return null;
  }

  var start = firstOpenSlot() || new Date();
  wheels.year.select(Math.max(0, wheels.year.indexOfValue(start.getFullYear())), false);
  wheels.month.select(start.getMonth(), false);
  rebuildDays();
  wheels.day.select(start.getDate() - 1, false);
  wheels.hour.select(((start.getHours() + 11) % 12), false);
  wheels.minute.select(Math.floor(start.getMinutes() / STEP_MIN), false);
  wheels.ampm.select(start.getHours() >= 12 ? 1 : 0, false);
  render();

  /* ---- Steps ------------------------------------------------------------- */

  toggle.addEventListener('click', function () {
    var open = root.getAttribute('data-open') !== 'true';
    root.setAttribute('data-open', String(open));
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      /* The columns were laid out inside a collapsed grid row. Their own
         height is fixed in CSS so scrollTop was settable, but re-running the
         depth pass after the panel is on screen costs nothing and covers any
         breakpoint change since. */
      Object.keys(wheels).forEach(function (k) { wheels[k].repaint(); });
    }
  });

  nextBtn.addEventListener('click', function () {
    if (nextBtn.disabled) return;
    show(stepDetails);
    emailInput.focus();
  });

  /* Two of these: the one under the form, and "Pick another slot" on the
     confirmation. Both land back on the wheels, and both have to undo a
     send that already ran. */
  Array.prototype.forEach.call(backBtns, function (btn) {
    btn.addEventListener('click', function () {
      sendBtn.disabled = false;
      sendBtn.textContent = sendLabel;
      show(stepPick);
      render();
    });
  });

  function show(step) {
    [stepPick, stepDetails, stepDone].forEach(function (s) {
      s.hidden = s !== step;
    });
    if (step === stepPick) {
      Object.keys(wheels).forEach(function (k) { wheels[k].repaint(); });
    }
  }

  /* ---- Submit ------------------------------------------------------------ */

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    submit();
  });

  emailInput.addEventListener('input', function () {
    emailInput.setCustomValidity('');
  });

  function submit() {
    var email = emailInput.value.trim();

    /* Cleared first: a message left over from last time would otherwise keep
       checkValidity() false no matter what they type now. */
    emailInput.setCustomValidity('');
    if (!email || !emailInput.checkValidity()) {
      emailInput.reportValidity();
      emailInput.focus();
      return;
    }
    /* type="email" is happy with "you@gmail", the script is not. Finding that
       out after a round trip reads like a failure rather than a typo. */
    if (!EMAIL_RE.test(email)) {
      emailInput.setCustomValidity('Add the rest of the domain, like .com');
      emailInput.reportValidity();
      emailInput.focus();
      return;
    }
    if (hpInput.value) return; // honeypot: a bot filled the hidden field

    var date = lastGood;
    if (!date || checkSlot(date) !== null) {
      show(stepPick);
      render();
      return;
    }

    var payload = {
      token: TOKEN,
      startIso: date.toISOString(),
      durationMin: DURATION_MIN,
      tz: localTz,
      email: email,
      name: nameInput.value.trim(),
      note: noteInput.value.trim(),
      company: hpInput.value
    };

    /* No endpoint configured yet: hand off to Google Calendar instead of
       dead-ending. The visitor presses Save on a prefilled event and Google
       mails the invite. Opened synchronously inside the click so the popup
       blocker allows it. */
    if (!ENDPOINT) {
      window.open(templateUrl(date, payload), '_blank', 'noopener');
      finish(
        'Almost there',
        'A Google Calendar tab just opened with the details filled in — press ' +
        'Save and the invite reaches ' + HOST_NAME.split(' ')[0] + '.'
      );
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';

    /* text/plain dodges the CORS preflight, which an Apps Script web app
       cannot answer. The /exec redirect does send Access-Control-Allow-Origin,
       so the JSON reply is readable. */
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error(data && data.error ? data.error : 'Could not book that slot.');
        finish(
          'Request sent',
          HOST_NAME.split(' ')[0] + ' confirms these by hand, so nothing is booked ' +
          'yet. There is a note in ' + email + ' already, and the calendar invite ' +
          'with the Meet link follows once it is confirmed.'
        );
      })
      .catch(function (err) {
        sendBtn.disabled = false;
        sendBtn.textContent = sendLabel;
        fail(err && err.message ? err.message : 'Something went wrong.', date, payload);
      });
  }

  function finish(title, body) {
    doneTitle.textContent = title;
    doneBody.textContent = body;
    show(stepDone);
    live.textContent = title + '. ' + body;
  }

  /* Two ways out, cheapest first. The Google Calendar hand-off is the same
     one used when no endpoint is configured — the visitor presses Save and the
     event arrives as an invitation, which is still yours to accept or decline.
     Then a prefilled email. Both reach you without the script. */
  function fail(message, date, payload) {
    doneTitle.textContent = 'That did not go through';
    doneBody.textContent = '';
    doneBody.appendChild(document.createTextNode(message + ' You can '));
    doneBody.appendChild(anchor(templateUrl(date, payload),
      'send it through Google Calendar', true));
    doneBody.appendChild(document.createTextNode(', '));
    doneBody.appendChild(anchor(mailtoUrl(date, payload.email),
      'send it by email', false));
    doneBody.appendChild(document.createTextNode(', or go back and try another slot.'));
    show(stepDone);
    live.textContent = 'Request failed. ' + message;
  }

  function anchor(href, text, newTab) {
    var a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (newTab) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  /* ---- Fallback links ---------------------------------------------------- */

  function stamp(d) {
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function templateUrl(date, payload) {
    var end = new Date(date.getTime() + DURATION_MIN * 60000);
    var who = payload.name || payload.email;
    var params = new URLSearchParams({
      action: 'TEMPLATE',
      text: HOST_NAME + ' × ' + who,
      dates: stamp(date) + '/' + stamp(end),
      details: (payload.note ? payload.note + '\n\n' : '') +
        'Requested from ' + HOST_NAME + "'s site. Add Google Meet before saving.",
      add: HOST_EMAIL + ',' + payload.email
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  function mailtoUrl(date, email) {
    var body = 'Hi ' + HOST_NAME.split(' ')[0] + ',\n\n' +
      'I would like a ' + DURATION_MIN + '-minute call on ' +
      date.toLocaleString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit'
      }) + ' (' + localTz + ') — ' + istLabelFmt.format(date) + ' IST.\n\n' +
      'You can reach me at ' + email + '.\n';
    return 'mailto:' + HOST_EMAIL +
      '?subject=' + encodeURIComponent('Meeting request') +
      '&body=' + encodeURIComponent(body);
  }
})();
