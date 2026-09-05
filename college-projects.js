/*
 * [college-projects] Playable YouTube inside the three Amity project panels.
 *
 * The other four .link-pop panels are pure CSS: :hover / :focus-within on the
 * group opens them, letting go closes them, and nothing inside is interactive.
 * These three hold video, which breaks that model in one specific way.
 *
 * Focus inside a cross-origin iframe does not match :focus-within in the
 * parent document. Measured, not assumed: after clicking into a YouTube embed,
 * document.activeElement is the IFRAME element but the ancestor group stops
 * matching :focus-within. So the CSS that holds every other panel open would
 * drop this one the moment the pointer wandered off, mid-video, with the audio
 * still running from a panel nobody can see.
 *
 * This file owns four things and nothing else:
 *   1. Building the real iframe on click, so no YouTube weight loads until
 *      somebody asks for a video.
 *   2. A latch (data-playing) that holds the panel open independently of the
 *      pointer, plus every way out of it.
 *   3. Tap-to-open on touch, where there is no hover to reveal the panel at
 *      all and styles.css would otherwise hide it outright.
 *   4. Setting data-playing, which college-projects.css uses to stand the
 *      panel's backdrop-filter down for the duration. An iframe's own
 *      compositing layer and the lens cannot share a panel — the video ends up
 *      painted under the surface with a rainbow traced round it.
 *
 * Remove by deleting this file, college-projects.css, their two tags in
 * index.html and the .work-row block on the Amity card.
 * See REMOVE-COLLEGE-PROJECTS.md.
 */
(function () {
  'use strict';

  var groups = document.querySelectorAll('.work-link--college');
  if (!groups.length) return;

  var touch = window.matchMedia('(hover: none)');

  /* One player at a time, page-wide. Two videos talking over each other is the
     failure people notice fastest, and the panels are close enough together
     that opening a second while the first is behind it is easy to do. */
  var active = null;

  /* Panel geometry, shared by all three. GAP is the hover gap styles.css hangs
     the panel at; CHROME is the panel's own padding plus its footer, the part
     of its height that is not strip; MIN_STRIP is the shortest strip worth
     opening upward into before the panel is better off flipping below. */
  var GAP = 12;
  var CHROME = 66;
  var MIN_STRIP = 200;

  var CLOSE_SVG =
    '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'd="M6 6l12 12M18 6L6 18"/></svg>';

  /* Tear the iframe out rather than pausing it. There is no postMessage
     handshake to pause without the IFRAME API, and a detached iframe stops its
     audio immediately, which is the actual requirement. The facade is put back
     so the panel looks the way it did before, and a second click rebuilds the
     player from scratch — cheap, and it restarts at the intended timestamp. */
  /* The panel's glass and a playing iframe do not coexist, and the fix for
     that is entirely in college-projects.css — see section 4c there. An
     earlier version drove the lens's displacement to zero from here, through
     the setScale() handle pop-glass.js publishes on panel._pgLens. It is gone:
     mutating an SVG filter does not reliably invalidate a backdrop-filter that
     already references it by url(), so it never actually flattened anything,
     and it addressed only one of the two symptoms in any case. The stylesheet
     takes the backdrop-filter off outright for the duration of data-playing. */

  function stop(group) {
    if (!group) return;
    var player = group.querySelector('.link-pop-player');
    if (player && player._facade) {
      player.replaceWith(player._facade);
    } else if (player) {
      player.remove();
    }
    delete group.dataset.playing;
    if (active === group) active = null;
  }

  function play(group, button) {
    if (active && active !== group) stop(active);
    stop(group);

    var id = button.dataset.yt;
    if (!id) return;

    var params = [
      'autoplay=1',
      'rel=0',
      /* modestbranding drops the YouTube wordmark from the control bar; the
         panel already says where this is going in its footer. */
      'modestbranding=1',
      'playsinline=1',
    ];
    if (button.dataset.start) params.push('start=' + button.dataset.start);

    var shell = document.createElement('div');
    shell.className = 'link-pop-player';

    var frame = document.createElement('iframe');
    /* -nocookie is what ArtStation itself embeds these with, and it keeps the
       page from handing YouTube a tracking cookie for a video nobody played. */
    frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?' + params.join('&');
    frame.title = button.querySelector('.link-pop-play-label')
      ? button.querySelector('.link-pop-play-label').textContent.trim()
      : 'Project video';
    frame.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    shell.appendChild(frame);

    /* Kept so stop() can restore the strip exactly, including the poster that
       has already been fetched — rebuilding the button would re-request it. */
    shell._facade = button;
    button.replaceWith(shell);

    group.dataset.playing = 'on';
    active = group;
  }

  groups.forEach(function (group) {
    var panel = group.querySelector('.link-pop');
    var tile = group.querySelector('.work-tile');
    if (!panel) return;

    /* The poster frames are held back on data-src for the same reason the
       gallery shots are, but script.js's loader only reaches
       `.link-pop-shot img` and these are not shots. Same trigger, same
       one-shot guard, so a panel's posters and its stills land together. */
    var posters = panel.querySelectorAll('.link-pop-play img[data-src]');
    if (posters.length) {
      var loaded = false;
      var loadPosters = function () {
        if (loaded) return;
        loaded = true;
        posters.forEach(function (img) {
          img.src = img.dataset.src;
        });
      };
      group.addEventListener('pointerenter', loadPosters);
      group.addEventListener('focusin', loadPosters);
      /* Touch never fires pointerenter before the tap that opens the panel,
         so the posters would arrive a beat late or not at all. */
      if (tile) tile.addEventListener('click', loadPosters);
    }

    /* Built here rather than in index.html because it only has a job while the
       latch is on, and a button in the markup would be one more thing to strip
       out when this feature goes. */
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'link-pop-close';
    close.innerHTML = CLOSE_SVG;
    close.setAttribute('aria-label', 'Close preview');
    panel.appendChild(close);

    /* Decide which side the panel opens on, before it is visible.

       Measured off the tile and the viewport ONLY — never off the panel's own
       height. That was the first version and it oscillated:

         open upward  -> --pop-room is set to (space above), so the panel grows
                         to fill exactly the space above
         next measure -> "does the panel fit above?" is now asking whether the
                         space above fits in the space above, minus the 12px
                         gap. It never quite does, so the panel flips down
         open downward-> --pop-room is re-set to (space below), the panel
                         resizes again, and the next measure flips it back up

       Every hover re-ran that and the panel visibly jumped up and down. Worse,
       it jumped out from under the pointer mid-click, which is why the play
       buttons on the taller panels could not be hit at all: the panel moved
       between pointerdown and pointerup.

       The fix is that the decision cannot read a quantity it also writes. Room
       above and room below are properties of where the tile is on screen; both
       are stable across as many measurements as you like. */
    var flip = function () {
      if (touch.matches) return; // fixed panel on touch; nothing to flip
      /* Never re-measure a panel that something is holding open. Re-deciding
         the side under a playing film would yank the video across the screen,
         and the latch means the pointer is free to leave and come back — which
         is exactly when pointerenter fires again. */
      if (group.dataset.playing || group.dataset.open) return;

      var navBlock =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--nav-block')
        ) || 80;
      var box = group.getBoundingClientRect();

      var above = box.top - navBlock - GAP;
      var below = window.innerHeight - box.bottom - GAP;

      /* Upward is the default and stays the default — it is what the four
         Experience panels do and what this row does everywhere except near the
         top of a short viewport. Flip down only when up is genuinely too tight
         AND down is the roomier side, so a panel never flips into less space
         than it left. */
      var down = above - CHROME < MIN_STRIP && below > above;

      if (down) group.dataset.flip = 'down';
      else delete group.dataset.flip;

      /* The panel can still be taller than the room on the side it chose. The
         strip is the only part that can give, so it is told how much space
         actually exists there and scrolls the rest. */
      var room = down ? below : above;
      panel.style.setProperty('--pop-room', Math.max(140, Math.round(room - CHROME)) + 'px');
    };
    group.addEventListener('pointerenter', flip);
    group.addEventListener('focusin', flip);

    close.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      stop(group);
      delete group.dataset.open;
      /* Focus was inside the panel that is now closing. Hand it back to the
         thing that opened it, or it lands on <body> and the next Tab restarts
         from the top of the page.

         Not on touch, where it reopens the panel it just closed: styles.css
         opens any .link-pop on :focus-within, this file un-hides these three
         on touch, and a tapped <a> keeps focus afterwards. The latch clears
         correctly and the video does stop — the panel simply comes straight
         back up. There is no keyboard focus order to preserve here anyway. */
      if (tile && !touch.matches) tile.focus();
    });

    panel.addEventListener('click', function (e) {
      var button = e.target.closest('.link-pop-play');
      if (!button) return;
      e.preventDefault();
      play(group, button);
    });

    /* Touch: no hover to reveal the panel, so the tile's tap opens it instead
       of leaving for ArtStation. The footer link inside the panel is still the
       way out, so nothing is lost — it just takes the tap that would otherwise
       have been spent by accident. */
    tile &&
      tile.addEventListener('click', function (e) {
        if (!touch.matches) return;
        if (group.dataset.open) return; // already open: let a second tap through
        e.preventDefault();
        groups.forEach(function (other) {
          if (other !== group) {
            delete other.dataset.open;
            stop(other);
          }
        });
        group.dataset.open = 'on';
      });
  });

  /* Escape closes whatever is latched. script.js already binds Escape per
     group to blur the trigger, which is what dismisses a focus-held panel;
     this is the latch's own exit and has to run whether or not focus is
     anywhere near the group — during playback it is inside the iframe, where
     no keydown of ours will ever be heard. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector(
      '.work-link--college[data-playing], .work-link--college[data-open]'
    );
    if (!open) return;
    stop(open);
    delete open.dataset.open;
    var tile = open.querySelector('.work-tile');
    if (tile && !touch.matches) tile.focus();
  });

  /* A click anywhere outside the latched group. On touch this is the main way
     out — Escape needs a keyboard — and on the desktop it matches how every
     other transient layer on the page behaves.

     composedPath(), not contains(e.target). Clicking a play button replaces
     that button with the player element during the panel's own handler, which
     runs first; by the time this one sees the same click, e.target is detached
     and contains() reports false for a click that came from inside the panel.
     The path is computed at dispatch, so it still holds the ancestors the
     click actually travelled through. Without this the first click both starts
     a video and immediately closes the panel it is playing in. */
  document.addEventListener('click', function (e) {
    var open = document.querySelector(
      '.work-link--college[data-playing], .work-link--college[data-open]'
    );
    if (!open) return;
    var path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    var inside = path.length ? path.indexOf(open) !== -1 : open.contains(e.target);
    if (inside) return;
    stop(open);
    delete open.dataset.open;
  });
})();
