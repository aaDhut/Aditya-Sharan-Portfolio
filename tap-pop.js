/*
 * [tap-pop] Tap-to-open for the preview panels on touch.
 *
 * On a pointer every .link-pop is pure CSS: :hover / :focus-within on the group
 * opens it and letting go closes it. On touch there is no hover, so styles.css
 * hid the panels outright and a tap on a tile followed its link instead. That
 * left the galleries, the résumé page and the certificate scans unreachable on
 * a phone. tap-pop.css un-hides them; this file is the latch that opens them.
 *
 * It owns four things and nothing else:
 *   1. The first tap on a trigger opens its panel instead of navigating.
 *   2. A second tap on an <a> trigger falls through and follows the link, so
 *      nothing that used to be one tap away is now unreachable. A <button>
 *      trigger has nowhere to go, so a second tap closes instead.
 *   3. Forcing the panel's lazy images, which script.js only loads on
 *      pointerenter / focusin — neither of which reliably precedes a tap.
 *   4. Every way back out: the close button, a tap outside, Escape.
 *
 * Scope is `:not(.work-link--college)`. The three film panels run their own
 * latch in college-projects.js, because a playing cross-origin iframe steals
 * focus out of the parent document and they have a video to stop on the way
 * out. The two files use the same data-open attribute on disjoint elements and
 * neither reads the other's.
 *
 * Desktop never enters any of this: every handler returns early unless
 * (hover: none) matches, checked at event time rather than at load so a device
 * that gains or loses a pointer is handled without a reload.
 *
 * Remove by deleting this file, tap-pop.css and their two tags in index.html.
 * See REMOVE-TAP-POP.md.
 */
(function () {
  'use strict';

  /* The four Experience tiles, the certificates tile, the résumé button. */
  var SELECTOR = '.work-link:not(.work-link--college), .resume-link';
  var OPEN_SELECTOR =
    '.work-link[data-open]:not(.work-link--college), .resume-link[data-open]';

  var groups = document.querySelectorAll(SELECTOR);
  if (!groups.length) return;

  var touch = window.matchMedia('(hover: none)');

  var CLOSE_SVG =
    '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'd="M6 6l12 12M18 6L6 18"/></svg>';

  /* One panel open at a time, page-wide. These sheets are fixed to the bottom
     of the viewport, so a second one does not sit beside the first — it lands
     exactly on top of it. */
  function closeOthers(keep) {
    groups.forEach(function (other) {
      if (other !== keep) delete other.dataset.open;
    });
  }

  groups.forEach(function (group) {
    var panel = group.querySelector('.link-pop');
    if (!panel) return;

    /* The tile for the six work groups, the download button for the résumé.
       Both are the group's first interactive child, so document order picks
       the right one; the .link-pop-shot anchors inside the panel come later. */
    var trigger = group.querySelector('.work-tile, .btn');
    if (!trigger) return;

    /* Built here rather than in index.html because it only has a job while the
       latch is on, and a button in the markup would be one more thing to strip
       out when this feature goes.

       First child, not appended. tap-pop.css makes it `position: sticky;
       top: 0` so it survives the scroll of a long gallery, and sticky can
       never carry an element above its own place in the flow — appended after
       the footer it would pin to the bottom of the strip instead. */
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'link-pop-close';
    close.innerHTML = CLOSE_SVG;
    close.setAttribute('aria-label', 'Close preview');
    panel.insertBefore(close, panel.firstChild);

    /* script.js holds these on data-src and swaps them in on the group's first
       pointerenter / focusin, so the panel costs nothing until somebody asks
       for it. Neither event reliably fires before the tap that opens the panel
       on touch, so the images would arrive a beat late or not at all. Read
       straight off the DOM rather than through script.js, so removing either
       file leaves the other working. */
    var loaded = false;
    function loadShots() {
      if (loaded) return;
      loaded = true;
      panel.querySelectorAll('img[data-src]').forEach(function (img) {
        img.src = img.dataset.src;
      });
    }

    close.addEventListener('click', function (e) {
      e.preventDefault();
      /* Or the document handler below sees this same click, finds the group
         already closed, and the next tap outside has nothing left to do. */
      e.stopPropagation();
      delete group.dataset.open;
    });

    trigger.addEventListener('click', function (e) {
      if (!touch.matches) return;

      if (group.dataset.open) {
        /* An anchor has somewhere to go: let the second tap through, so the
           ArtStation project and the résumé PDF are still one tap further in
           rather than lost. The certificates trigger is a <button> with no
           href, so for that one the second tap is the way back out. */
        if (trigger.tagName !== 'A') {
          e.preventDefault();
          delete group.dataset.open;
        }
        return;
      }

      e.preventDefault();
      closeOthers(group);
      loadShots();
      group.dataset.open = 'on';
    });
  });

  /* A tap anywhere outside the open group. On touch this is the main way out —
     Escape needs a keyboard — and it matches how every other transient layer on
     this page behaves.
     
     composedPath(), not contains(e.target): the path is computed at dispatch,
     so it still holds the ancestors a click travelled through even if an
     earlier handler has since detached the element it started on. */
  document.addEventListener('click', function (e) {
    var open = document.querySelector(OPEN_SELECTOR);
    if (!open) return;
    var path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    var inside = path.length ? path.indexOf(open) !== -1 : open.contains(e.target);
    if (inside) return;
    delete open.dataset.open;
  });

  /* Escape, in the CAPTURE phase — and that is load-bearing, not a stylistic
     choice.

     script.js and certificates.js each bind Escape on the group itself, to
     blur whatever is focused; that is what dismisses a panel held open by
     :focus-within, and both call stopPropagation() when focus is inside the
     group. A tapped panel always has focus inside it, so a bubble-phase
     listener on document is never reached and Escape did nothing at all —
     measured, with the panel still latched open afterwards.

     Capturing runs this before either of them, on the way down. Their blur
     still happens and is a harmless no-op once tap-pop.css has taken
     :focus-within out of the picture. */
  document.addEventListener(
    'keydown',
    function (e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector(OPEN_SELECTOR);
      if (!open) return;
      delete open.dataset.open;
    },
    true
  );
})();
