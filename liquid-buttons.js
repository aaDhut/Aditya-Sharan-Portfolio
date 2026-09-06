/*
 * [liquid-buttons] The lens on the contact buttons.
 *
 * liquid-buttons.css gives every button the iOS 26 material. This file adds
 * the one thing CSS cannot: real refraction, with real chromatic aberration.
 * liquidGlass() (glass.js) builds a displacement map from the capsule's signed
 * distance field and bends the live backdrop through it in three passes — one
 * per colour channel, each at a slightly different scale — so the split
 * appears only where the surface actually curves.
 *
 * ---- Why this file targets three buttons and not twenty --------------------
 *
 * A backdrop-filter samples what is behind the element. Inside an element that
 * already has one, it samples the parent's filtered output through a capture
 * Chromium clips to the child, and for a small child in a filtered parent that
 * capture degenerates: measured, a lens on each of the seven nav links inside
 * the already-lensed header rendered every link as a flat opaque grey pill.
 *
 * So the only buttons that can take a lens are the ones with a real, unfiltered
 * backdrop behind them, and after the hero pair (droplet-buttons.js) and the
 * call pill (call-glass.js) have taken theirs, that is the three in
 * .contact-links. They sit on a flat section directly above the lensed pill and
 * currently read as cardboard beside it, which is the whole reason for this.
 *
 * The nav links, the burger and the popup's two buttons are already sitting on
 * a pane of real refracting glass. In iOS 26 terms they are facets of one
 * pane, not panes of their own.
 *
 * ---- The numbers -----------------------------------------------------------
 *
 * Taken from the call pill in call-glass.js rather than invented: same size,
 * same flat section, same few centimetres of screen. That file documents a
 * ceiling worth not re-discovering — a displacement larger than the band it is
 * spread over sends the rim sampling outside Chromium's element-clipped
 * backdrop capture, and each channel runs off it at a different offset, which
 * paints a saturated rainbow smear along the bottom edge and around the ends.
 *
 * Remove by deleting this file, liquid-buttons.css and their two tags in
 * index.html. See REMOVE-LIQUID-BUTTONS.md.
 */
/*
 * [liquid-buttons] The travelling glint, on every button.
 *
 * A collaboration with the stylesheet, in the shape droplet-buttons.js and
 * call-glass.js already established: this writes the pointer's position into
 * --gx/--gy as a 0..1 fraction of the button's own box, and liquid-buttons.css
 * decides what light to make of it. The fade in and out is entirely CSS —
 * :hover sets --lb-glow-a to 100% — so nothing here has to model hover state.
 *
 * ---- Why it attaches to buttons that already have a driver ----------------
 *
 * The hero pair and the call button each carry one of their own, in
 * droplet-buttons.js and call-glass.js, writing the same two properties from
 * the same formula. Attaching here as well is deliberate redundancy, not an
 * oversight: it is what lets either of those features be deleted without the
 * glint disappearing from a button whose material this file is now painting.
 * Two identical writers on one element land the same value on the same frame,
 * and the second costs one getBoundingClientRect per pointermove.
 *
 * The nav links and the burger are left out. A glint chasing the pointer
 * inside a 36px nav pill is noise rather than light, and the burger only
 * exists at a width where there is no pointer to chase.
 */
(function () {
  'use strict';

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  /* Coarse pointers get no glint at all. There is no hover to fade it in, and
     a highlight that appears under a finger is hidden by the finger. */
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* Where the glint parks when nothing is pointing at it: top centre, which is
     where a light source is if you are not told otherwise. Matches the
     initial-value on the registered properties, so the first fade-in of a
     never-hovered button starts from the same place as every later one. */
  var HOME_X = 0.5;
  var HOME_Y = 0.12;

  Array.prototype.forEach.call(document.querySelectorAll('.btn'), function (btn) {
    var queued = false;
    var pending = null;

    /* One rAF per frame regardless of how many pointermove events arrive in
       it. Writing a custom property is a style invalidation, and pointermove
       can fire several times between frames on a high-rate mouse. */
    function write() {
      queued = false;
      if (!pending) return;
      btn.style.setProperty('--gx', pending.x);
      btn.style.setProperty('--gy', pending.y);
    }

    function queue(next) {
      pending = next;
      if (queued) return;
      queued = true;
      requestAnimationFrame(write);
    }

    btn.addEventListener('pointermove', function (ev) {
      if (calm.matches || !fine.matches) return;
      var r = btn.getBoundingClientRect();
      if (!r.width || !r.height) return;
      queue({
        x: ((ev.clientX - r.left) / r.width).toFixed(3),
        y: ((ev.clientY - r.top) / r.height).toFixed(3)
      });
    });

    /* Sent home on the way out rather than left where the pointer crossed the
       edge. --gx/--gy are registered properties with a transition, so this
       eases back over 0.45s underneath the opacity fading out over 0.28s — the
       glint is gone before it finishes travelling, and the next hover starts
       from centre instead of from wherever the last one ended. */
    btn.addEventListener('pointerleave', function () {
      queue({ x: HOME_X, y: HOME_Y });
    });
  });
})();

(function () {
  'use strict';

  if (typeof liquidGlass !== 'function') return;

  /* Only the contact trio. .mp-toggle is a sibling inside .mp and is excluded
     by the parent selector — it has its own lens, tuned alongside the popup it
     opens, and two lenses on one element would fight over the same inline
     backdrop-filter. */
  var buttons = document.querySelectorAll('.contact-links .btn');
  if (!buttons.length) return;

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var plain = window.matchMedia('(prefers-reduced-transparency: reduce)');

  /* Honour Reduce Transparency: liquid-buttons.css turns the material opaque
     under it, and refraction behind an opaque surface is invisible work. */
  if (plain.matches) return;

  /* Multiplier on the configured displacement. The hero buttons use 1.5; this
     is gentler because these sit on a flat section, where a harder bend has
     nothing extra to reveal — the backdrop looks the same however far it is
     pushed, so the swell would cost frames and show nothing. */
  var SWELL = 1.35;

  Array.prototype.forEach.call(buttons, function (btn) {
    var lens = liquidGlass(btn, {
      /* The capsule is ~48px tall, so the curved band is most of the object
         rather than a thin edge on a wide bar. */
      band: 22,
      /* Kept well inside the band — see the ceiling described above. */
      scale: 26,
      dispersion: 0.15,
      /* Glass is clear. The 7px frost liquid-buttons.css sets is exactly what
         would hide the refraction this is turning on. */
      blur: 0.5,
      saturate: 1.9,
      fallbackBlur: 3.5
    });

    /* Only when the lens is real. On Safari and Firefox liquidGlass falls back
       to a plain frost and reports supported:false, and the thinner tint that
       data-lens selects would then be thinning a surface with no refraction
       under it to justify it. */
    if (!lens.supported) return;
    btn.dataset.lens = 'on';

    /* ---- Swell ----------------------------------------------------------
       The backdrop bends harder as the pointer approaches. A CSS transform
       scales the element; only this scales the refraction itself.

       Exponential smoothing rather than a fixed tween: a pointer that leaves
       mid-ramp reverses from wherever it got to, with no bookkeeping. Same
       approach as droplet-buttons.js, so the two sets of buttons behave
       identically under the pointer. */
    var current = 1;
    var target = 1;
    var running = false;

    function step() {
      current += (target - current) * 0.18;
      if (Math.abs(target - current) < 0.004) {
        current = target;
        running = false;
      }
      lens.setScale(current);
      if (running) requestAnimationFrame(step);
    }

    function swellTo(next) {
      if (calm.matches) return;
      target = next;
      if (running || current === target) return;
      running = true;
      requestAnimationFrame(step);
    }

    btn.addEventListener('pointerenter', function () {
      swellTo(SWELL);
    });

    btn.addEventListener('pointerleave', function () {
      swellTo(1);
    });

    /* Keyboard parity: tabbing to the button gets the same object the pointer
       would get. */
    btn.addEventListener('focus', function () {
      if (btn.matches(':focus-visible')) swellTo(SWELL);
    });

    btn.addEventListener('blur', function () {
      swellTo(1);
    });
  });
})();
