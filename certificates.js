/*
 * [certificates] Which side the certificates panel opens on.
 *
 * The one thing about this feature that CSS cannot decide. Everything else —
 * the cluster, the divider, the overline, the placeholder collage, the panel
 * itself and the tap behaviour on touch — is in certificates.css and works
 * without this file. Drop it and the panel still opens; it just always opens
 * upward, which is wrong most of the time on this particular card.
 *
 * Why it is wrong: every .link-pop opens upward, which is right for the four
 * Experience tiles that sit low on tall cards in the middle of a long page.
 * This one is the last thing on the last card of the Education section and the
 * panel is ~400px, so measured across 700–1000px viewports it was clipped by
 * the nav in every position a reader would actually be in — 120px lost with
 * the card centred in a 1000px window, and the whole panel gone with the
 * section scrolled to the top. Not an edge case: the default state.
 *
 * This is the same measurement college-projects.js makes for the same reason,
 * with none of the latch around it — these panels hold no video, so nothing
 * needs to hold them open and there is nothing to close.
 *
 * Remove: see REMOVE-CERTIFICATES.md.
 */
(function () {
  var groups = document.querySelectorAll('.work-link--cert');
  if (!groups.length) return;

  /* On touch the panel is a fixed sheet at the bottom of the screen (see
     section 6 of certificates.css). There are no sides to choose between. */
  var touch = window.matchMedia('(hover: none)');

  var GAP = 12; // the pointer-bridge gap between tile and panel
  var CHROME = 66; // the panel's own padding and footer, outside the strip
  var MIN_STRIP = 200; // below this the panel is not worth opening upward

  groups.forEach(function (group) {
    var panel = group.querySelector('.link-pop');
    if (!panel) return;

    /* Measured off the tile and the viewport ONLY, never off the panel's own
       height. Reading a quantity this function also writes is what made the
       first version of the college flip oscillate — the long version of that
       story is in college-projects.js and applies here unchanged. Room above
       and room below are properties of where the tile is on screen, so they
       are stable across as many measurements as you like. */
    var flip = function () {
      if (touch.matches) return;

      var navBlock =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--nav-block')
        ) || 80;
      var box = group.getBoundingClientRect();

      var above = box.top - navBlock - GAP;
      var below = window.innerHeight - box.bottom - GAP;

      /* Upward stays the default — it is what every other panel on the page
         does. Flip down only when up is genuinely too tight AND down is the
         roomier side, so the panel never flips into less space than it left. */
      if (above - CHROME < MIN_STRIP && below > above) {
        group.dataset.flip = 'down';
      } else {
        delete group.dataset.flip;
      }

      /* The panel can still be taller than the room on the side it chose. The
         strip is the only part that can give, so it is told how much space
         actually exists there and scrolls the rest. */
      var room = group.dataset.flip === 'down' ? below : above;
      panel.style.setProperty(
        '--pop-room',
        Math.max(140, Math.round(room - CHROME)) + 'px'
      );
    };

    group.addEventListener('pointerenter', flip);
    group.addEventListener('focusin', flip);
  });
})();
