/*
 * Droplet buttons — the live half of the hero buttons' liquid glass.
 *
 * Self-contained and removable: see REMOVE-DROPLET-BUTTONS.md.
 *
 * Two things happen here that CSS cannot do:
 *
 *   1. The lens itself. liquidGlass() (glass.js) builds a displacement map
 *      from the capsule's signed distance field and bends the live backdrop
 *      through it, splitting the channels at the rim. The parameters below are
 *      retuned for a small pill — the nav bar's settings tear on an object
 *      this size, because the whole button is rim.
 *
 *   2. The swell. On hover the displacement scale ramps up, so the backdrop
 *      visibly bends *harder* as you approach. A CSS transform scales the
 *      element; only this scales the refraction.
 *
 * The specular glint is a collaboration: this file writes the pointer position
 * into --gx/--gy, droplet-buttons.css decides what light to make of it.
 */
(function () {
  'use strict';

  var buttons = document.querySelectorAll('.hero-actions .btn');
  if (!buttons.length || typeof liquidGlass !== 'function') return;

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  // Resting position of the glint, matching the CSS initial-value: overhead
  // and slightly forward, where the top rim crescent already sits.
  var HOME_X = 0.5;
  var HOME_Y = 0.12;

  // Multiplier on the configured displacement. 1 is the resting bend.
  var SWELL = 1.5;

  Array.prototype.forEach.call(buttons, function (btn) {
    var lens = liquidGlass(btn, {
      // The pill is ~48px tall, so the curved band is nearly the whole object
      // rather than a thin edge on a wide bar.
      band: 20,
      // Bend has to stay proportional to size. The nav's 130 on a capsule this
      // small pushes the map past its own geometry and shears the backdrop.
      scale: 58,
      // More curvature per pixel than the nav bar, so the fringe wants to be
      // wider to read at all. Still rim-only: the map is neutral across the
      // flat centre, so there is nothing to split there.
      dispersion: 0.22,
      // A droplet is clear. The 7px frost this replaces is exactly what was
      // hiding the refraction underneath.
      blur: 1,
      saturate: 1.9,
      fallbackBlur: 7
    });

    /* ---- Swell ---------------------------------------------------------- */

    var current = 1;
    var target = 1;
    var swelling = false;

    function step() {
      // Exponential smoothing rather than a fixed-length tween: a pointer that
      // leaves mid-ramp reverses from wherever it got to, with no bookkeeping.
      current += (target - current) * 0.18;

      if (Math.abs(target - current) < 0.004) {
        current = target;
        swelling = false;
      }

      lens.setScale(current);
      if (swelling) requestAnimationFrame(step);
    }

    function swellTo(next) {
      if (calm.matches) return;
      target = next;
      if (swelling || current === target) return;
      swelling = true;
      requestAnimationFrame(step);
    }

    /* ---- Glint ---------------------------------------------------------- */

    var queued = false;
    var pending = null;

    function writeGlint() {
      queued = false;
      if (!pending) return;
      btn.style.setProperty('--gx', pending.x);
      btn.style.setProperty('--gy', pending.y);
    }

    function track(e) {
      if (calm.matches || !fine.matches) return;
      var r = btn.getBoundingClientRect();
      if (!r.width || !r.height) return;

      pending = {
        x: ((e.clientX - r.left) / r.width).toFixed(3),
        y: ((e.clientY - r.top) / r.height).toFixed(3)
      };

      if (!queued) {
        queued = true;
        requestAnimationFrame(writeGlint);
      }
    }

    function home() {
      pending = { x: HOME_X, y: HOME_Y };
      if (!queued) {
        queued = true;
        requestAnimationFrame(writeGlint);
      }
    }

    btn.addEventListener('pointerenter', function () {
      swellTo(SWELL);
    });

    btn.addEventListener('pointermove', track);

    btn.addEventListener('pointerleave', function () {
      swellTo(1);
      // The CSS transition on --gx/--gy eases it back rather than snapping.
      home();
    });

    // Keyboard parity: the same swell on focus, so tabbing to the button gets
    // the same object it would get under the pointer.
    btn.addEventListener('focus', function () {
      if (btn.matches(':focus-visible')) swellTo(SWELL);
    });

    btn.addEventListener('blur', function () {
      swellTo(1);
      home();
    });
  });
})();
