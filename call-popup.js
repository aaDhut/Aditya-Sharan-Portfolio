/* ==========================================================================
   Call pop-up — placement and dismissal for the floating booking panel
   ==========================================================================

   Self-contained and removable: see REMOVE-CALL-POPUP.md. Nothing in
   meeting-picker.js or meeting-picker.css was touched to add this, and nothing
   there knows this file exists.

   The picker already has a working open/close state machine: its toggle flips
   data-open on .mp and mirrors it to aria-expanded. This file does not replace
   any of that and does not bind the toggle. It *watches* data-open and adds
   the four things CSS cannot do for a floating panel:

     1. placement  — which side of the button has room, and how much
     2. dismissal  — Escape, and a click outside
     3. focus      — into the panel on open, back to the button on close
     4. scroll lock — while the phone sheet is up

   Watching the attribute rather than listening on the button is what keeps
   the two files independent. There is no ordering to get right between two
   click handlers on one element, and if meeting-picker.js ever changes how it
   opens the panel, this keeps working as long as data-open still means open.
   ========================================================================== */

(function () {
  'use strict';

  /* ---- Configuration ----------------------------------------------------- */

  /* When the panel becomes a bottom sheet: too narrow to anchor beside the
     button, or too short to open above it at any rung of the ladder below.
     Must match the media query in call-popup.css — the CSS owns the look,
     this owns the behaviour, and they have to change sides on the same
     pixel. */
  var SHEET_AT = '(max-width: 560px), (max-height: 520px)';

  /* Clearance the panel keeps from the viewport edges. The top figure is added
     to the measured header height, since the nav pill floats over the page and
     a panel tucked under it reads as broken. */
  var EDGE = 16;
  var GAP = 12;

  /* The rungs of the fit ladder, largest first. '' is the panel's natural
     size; the rest are the data-fit values call-popup.css styles. Kept here
     rather than derived, because the order is the behaviour: each rung has to
     be a real step smaller than the one above it. */
  var FIT_STEPS = ['', 'compact', 'tight'];

  /* What the sheet is allowed to cover, matching max-height: min(86vh, ...)
     in the stylesheet. Past that it stops reading as a layer over the page. */
  var SHEET_CAP = 0.86;

  /* ---- Wiring ------------------------------------------------------------ */

  var root = document.querySelector('.mp');
  if (!root) return;

  var toggle = root.querySelector('.mp-toggle');
  var collapse = root.querySelector('.mp-collapse');
  var panel = root.querySelector('.mp-panel');
  if (!toggle || !collapse || !panel) return;

  /* The hook every rule in call-popup.css is scoped under. Set from here so
     the stylesheet is inert without this script: a page that loads the CSS but
     fails to load the JS keeps the accordion rather than getting a panel with
     no way to place or dismiss it. */
  root.setAttribute('data-popup', 'on');

  /* Focus has to be able to land on the panel itself. There is no single right
     control to focus inside it — the six wheels are equals, and focusing one
     would imply it is the one that matters. */
  panel.setAttribute('tabindex', '-1');

  var sheet = window.matchMedia(SHEET_AT);
  var header = document.querySelector('.site-header');
  var bodyOverflow = '';
  var framePending = false;

  function isOpen() {
    return root.getAttribute('data-open') === 'true';
  }

  function isSheet() {
    return sheet.matches;
  }

  /* ---- Placement --------------------------------------------------------- */

  /* Above by default, the way .link-pop opens — the contact section is the
     last on the page, so below the button is usually the footer and then
     nothing. Flipped only when below genuinely has more room.

     Both sides get a measured cap written to --cp-max-h, so the panel scrolls
     internally rather than running off the screen. The wheels already set
     overscroll-behavior: contain, so flinging one does not hand its leftover
     momentum to that scroll. */
  function place() {
    /* The sheet is pinned to the bottom edge and sized by CSS. Leaving a
       desktop measurement behind would cap it at whatever the last window
       height happened to be. */
    if (isSheet()) {
      root.removeAttribute('data-place');
      panel.style.removeProperty('--cp-max-h');
      return;
    }

    var rect = toggle.getBoundingClientRect();
    /* Measured off the real element rather than read from --nav-block: that
       token is a calc() of two others, which does not resolve to a length in
       every browser's getComputedStyle. */
    var headerH = header ? header.getBoundingClientRect().height : 0;

    var above = rect.top - GAP - headerH - EDGE;
    var below = window.innerHeight - rect.bottom - GAP - EDGE;

    /* scrollHeight is the content's full height even while max-height is
       clamping the box, so this stays honest across a resize. The border is
       not in it. */
    var needed = panel.scrollHeight + 2;

    var useBelow;
    if (above >= needed) useBelow = false;
    else if (below >= needed) useBelow = true;
    else useBelow = below > above;

    if (useBelow) root.setAttribute('data-place', 'below');
    else root.removeAttribute('data-place');

    /* Never below a floor — on a very short window the honest answer is a
       cramped scrolling panel, not a sliver too small to show a wheel. */
    panel.style.setProperty('--cp-max-h', Math.max(useBelow ? below : above, 240) + 'px');
  }

  /* ---- Fit -------------------------------------------------------------- */

  function rung() {
    var at = FIT_STEPS.indexOf(root.getAttribute('data-fit') || '');
    return at < 0 ? 0 : at;
  }

  function setRung(i) {
    var step = FIT_STEPS[Math.max(0, Math.min(FIT_STEPS.length - 1, i))];
    if (step) root.setAttribute('data-fit', step);
    else root.removeAttribute('data-fit');
  }

  /* The room the panel really has, right now, on the side it is really on —
     not a budget it might get. An earlier version measured the best case
     instead, counting room that makeRoom was expected to buy by scrolling the
     page; on a short document that scroll cannot happen, the optimism was
     never checked, and the panel opened clipped anyway. Measuring after the
     fact is what makes the ladder honest. */
  function roomNow() {
    if (isSheet()) return window.innerHeight * SHEET_CAP;

    var rect = toggle.getBoundingClientRect();
    var headerH = header ? header.getBoundingClientRect().height : 0;

    if (root.getAttribute('data-place') === 'below') {
      return window.innerHeight - rect.bottom - GAP - EDGE;
    }
    return rect.top - GAP - headerH - EDGE;
  }

  /* +2 for the panel's own borders, which scrollHeight leaves out, and a pixel
     of slack on the other side. makeRoom scrolls the page by exactly the
     deficit, so on a laptop this comparison is almost always decided on the
     last fraction of a pixel — and the two sides of it are rounded
     differently by the browser. Without the slack a 1280x800 window loses the
     five-row dials to a 0.4px shortfall that produces a scrollbar nobody can
     see or reach. */
  function fits() {
    return panel.scrollHeight + 2 <= roomNow() + 1;
  }

  /* Full size first, then down a rung at a time until the whole picker fits
     the room it actually gets.

     makeRoom and place run on every pass, not once at the end, because both
     move the thing being measured: makeRoom scrolls the page, which changes
     how much room is above, and place picks the side and writes the cap. So
     each rung is judged in the position it would really open in.

     Falls off the bottom rung on a genuinely tiny window. That leaves the
     smallest size and the max-height cap — a scrolling panel, but only where
     no arrangement of six dials and a button was going to fit anyway.

     Three passes at most, each forcing a layout, and only on open, resize or a
     step change. Never from scroll. */
  function fit() {
    setRung(0);
    makeRoom();
    place();

    for (var i = 1; i < FIT_STEPS.length && !fits(); i++) {
      setRung(i);
      makeRoom();
      place();
    }

    recentreWheels();
  }

  /* Scrolling the page moves the button, so the room can shrink out from
     under an open panel. This takes rungs off but never puts them back: a
     dial that grew and shrank as the page moved under the pointer would be
     far worse than one that quietly settled smaller. The next open starts
     from the top of the ladder again. */
  function shrinkToFit() {
    var from = rung();

    for (var i = from + 1; i < FIT_STEPS.length && !fits(); i++) {
      setRung(i);
      place();
    }

    if (rung() !== from) recentreWheels();
  }

  /* A rung that changes the item height moves the value the selected row sits
     at, and the browser's own scroll anchoring will not reliably put it back —
     so the columns are re-centred by hand.

     Measured off the selected row rather than computed from the geometry: the
     wheels belong to meeting-picker.js, and this way nothing here has to know
     how it sizes them. Setting scrollTop to a value it already holds is a
     no-op, so the common rung change costs nothing. */
  function recentreWheels() {
    var wheels = root.querySelectorAll('.mp-wheel');

    Array.prototype.forEach.call(wheels, function (el) {
      var sel = el.querySelector('.mp-item[aria-selected="true"]');
      if (!sel) return;
      el.scrollTop = sel.offsetTop - (el.clientHeight - sel.offsetHeight) / 2;
    });
  }

  /* Even side by side the panel wants ~425px, and a 1280x800 window offers
     about 300 above the button where it sits — so without this it opens on a
     rung or two below its best, and on a short window it opens scrolling: an
     outer scrollbar running alongside six wheels that are themselves scroll
     containers, which is a genuinely confusing thing to hand someone.

     The room exists, it is just in the wrong place: the contact section is the
     last on the page, so the button sits near the bottom with the whole
     document above it. Scrolling the page up moves the button down the screen
     and the deficit closes.

     Three things bound how far it may go, and the smallest of them wins:

       deficit     — only ever take what the panel is actually short by
       scrollY     — only ever take what the page has left above
       headroom    — never push the button itself off the bottom edge

     That last one is why this is a signed number rather than a distance. A
     window resized shorter can leave the button below the fold, and headroom
     goes negative; the result is a scroll the other way, which pulls the
     anchor back into view. A panel hung off something nobody can see is not a
     placement problem worth solving. */
  function makeRoom() {
    if (isSheet()) return;

    var rect = toggle.getBoundingClientRect();
    var headerH = header ? header.getBoundingClientRect().height : 0;

    var deficit = Math.max((panel.scrollHeight + 2) - (rect.top - GAP - headerH - EDGE), 0);
    var headroom = window.innerHeight - rect.bottom;

    var by = Math.min(deficit, window.scrollY, headroom);
    if (by === 0) return;

    /* This scroll has to land before the next line of JS runs, and styles.css
       puts scroll-behavior: smooth on html — so a glide would still be in
       flight when fit() re-measures, reading as room the panel does not have.
       That costs it a whole rung on a 620px-tall window: the wheels drop to
       their smallest size for room that arrived 300ms later. The same stale
       reading reaches the scroll listener, which would then shrink the panel
       again on the way down.

       Suppressed through the style rather than scrollBy's own behavior:
       'instant' — that value is a WebIDL enum, so passing it to a browser
       that predates it throws a TypeError rather than being ignored, and this
       file still carries a fallback for Safari 13.

       Nothing is lost visually: the panel is scaling in over this, so the eye
       is on the panel arriving rather than on the page moving under it. */
    var behavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollBy(0, -by);
    document.documentElement.style.scrollBehavior = behavior;
  }

  /* Placement is cheap but it is called from scroll. One measurement per
     frame, and only while the panel is up. */
  function schedulePlace() {
    if (!isOpen() || framePending) return;
    framePending = true;
    window.requestAnimationFrame(function () {
      framePending = false;
      if (!isOpen()) return;
      place();
      shrinkToFit();
    });
  }

  /* ---- Open and close ---------------------------------------------------- */

  function close() {
    if (!isOpen()) return;
    root.setAttribute('data-open', 'false');
    toggle.setAttribute('aria-expanded', 'false');
  }

  /* Fires after meeting-picker.js has flipped the attribute, as a microtask —
     so this still runs before the browser paints the frame the panel opens on,
     and the measurement is never a frame late. */
  var observer = new MutationObserver(function (records) {
    var stateChanged = false;
    var contentChanged = false;

    records.forEach(function (rec) {
      if (rec.target === root && rec.attributeName === 'data-open') stateChanged = true;
      /* A step being shown or hidden changes the panel's height by a lot —
         the wheels are ~500px, the email form is not — so the side it opens on
         and the cap it takes both have to be worked out again. */
      else if (rec.attributeName === 'hidden') contentChanged = true;
    });

    if (stateChanged) {
      if (isOpen()) opened();
      else closed();
    } else if (contentChanged && isOpen()) {
      fit();
    }
  });

  observer.observe(root, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-open', 'hidden']
  });

  function opened() {
    /* One call: fit() runs makeRoom and place itself, once per rung, because
       the size it is choosing and the room it is choosing against depend on
       each other. Every measurement inside it is taken after the page has
       finished moving — see the note on the scroll in makeRoom. */
    fit();

    if (isSheet()) {
      /* Scroll behind a sheet is a genuine annoyance, not a nicety: the sheet
         is fixed, so the page slides around underneath it. Note that iOS
         Safari does not fully honour this — a determined drag on the page
         behind still moves it. The alternative is pinning the body with
         position:fixed and restoring scrollTop by hand, which fights the
         picker's own scroll containers; this is the smaller problem. */
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    /* preventScroll matters. Without it the browser scrolls the panel into
       view itself, which on the sheet means scrolling the page behind it the
       instant the scroll lock went on. */
    panel.focus({ preventScroll: true });
  }

  function closed() {
    document.body.style.overflow = bodyOverflow;

    /* Only reclaim focus if it is still inside the panel. If the visitor
       closed it by clicking a link elsewhere on the page, that is where focus
       belongs. */
    if (panel.contains(document.activeElement)) {
      toggle.focus({ preventScroll: true });
    }
  }

  /* ---- Dismissal --------------------------------------------------------- */

  /* pointerdown rather than click: it fires before focus moves, so the panel
     closes on the press rather than on the release. */
  document.addEventListener('pointerdown', function (ev) {
    if (!isOpen()) return;
    if (collapse.contains(ev.target)) return;

    /* The toggle is outside the panel, so without this a press on it would be
       read as an outside click, close the panel here, and then let
       meeting-picker.js's own click handler find data-open="false" and open it
       straight back up. The button would stop closing what it opened. */
    if (toggle.contains(ev.target)) return;

    close();
  });

  document.addEventListener('keydown', function (ev) {
    if (!isOpen()) return;
    if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
    ev.preventDefault();
    close();
    toggle.focus({ preventScroll: true });
  });

  /* ---- Keeping up with the page ------------------------------------------ */

  /* Resizing the window while the panel is up changes how much room there is,
     so the page may need to give some back — a window dragged taller should
     get the whole panel, not the cap the old height forced.

     makeRoom is deliberately not wired to scroll. It scrolls the page itself,
     which would fire the very event that called it; and a visitor scrolling
     away from an open panel is not asking to be dragged back. */
  window.addEventListener('resize', function () {
    if (!isOpen()) return;
    /* A window dragged taller should climb back up the ladder, not keep the
       rung the old height forced on it — so this is the full fit, not the
       one-way shrink that scrolling gets. */
    fit();
  });

  window.addEventListener('scroll', schedulePlace, { passive: true });

  /* Crossing the sheet breakpoint with the panel open swaps two different
     layouts, and the stale --cp-max-h from the other one has to go. */
  var onBreakpoint = function () {
    if (isOpen()) {
      /* The sheet stacks the dials where the panel sets them side by side, so
         the two layouts need different rungs for the same content. */
      fit();
      if (isSheet()) {
        bodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = bodyOverflow;
      }
    }
  };

  if (sheet.addEventListener) sheet.addEventListener('change', onBreakpoint);
  else sheet.addListener(onBreakpoint); // Safari < 14
})();
