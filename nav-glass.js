/*
 * nav-glass.js — [nav-glass] Removable feature.
 *
 * Gives the nav pills the same real displacement lens every other capsule on
 * the page already has. Two steps, and the first is what makes the second
 * possible:
 *
 *   1. Hoist. script.js applies the bar's lens to .header-inner itself, which
 *      makes that element a backdrop root — every descendant then samples a
 *      flattened composite instead of the page, which is why a pill's own
 *      backdrop-filter came out as flat paint and why script.js says the pills
 *      can't have one. Moving the filter onto a plate div inset inside
 *      .header-inner renders the bar identically and takes the backdrop root
 *      off the pills' ancestor chain.
 *
 *   2. Lens. Each pill then gets its own liquidGlass() lens, attached lazily
 *      the first time it is hovered, focused or activated, and toggled on and
 *      off from there. It is never left on at rest: a backdrop-filter on a
 *      capsule with no capsule drawn would blur a pill-shaped hole in the bar.
 *
 * Everything is guarded. If glass.js never loaded, if the bar never got a
 * lens, or if the viewport is the mobile dropdown rather than the bar, this
 * returns before touching anything and the page is exactly what it was.
 *
 * Step 2 has one fork in it. If [nav-morph] is attached, the seven capsules
 * have been replaced by a single travelling one, and the lens goes to that
 * instead — see the handoff below. Remove nav-morph and the fork is not taken
 * and the pills are lensed exactly as they were.
 *
 * See REMOVE-NAV-GLASS.md.
 */
(function () {
  'use strict';

  var mq = window.matchMedia;

  /* Reduce Transparency asks for opaque surfaces. Attaching a refraction lens
     under that setting is the opposite of what was asked, and the stylesheet's
     own reduced-transparency rule expects this file to have stayed out. */
  if (mq && mq('(prefers-reduced-transparency: reduce)').matches) return;

  if (typeof liquidGlass !== 'function') return;

  var bar = document.querySelector('.header-inner');
  if (!bar) return;

  /* ---- 1. Hoist the bar's filter onto its own plate ---------------------
     Read from the inline style rather than the computed one on purpose: this
     has to be the value script.js wrote, and finding nothing there means the
     lens never got applied — in which case there is no backdrop root to escape
     and nothing here should run. */
  var filter = bar.style.backdropFilter || bar.style.webkitBackdropFilter;
  if (!filter || filter === 'none') return;

  var plate = document.createElement('div');
  plate.className = 'nav-glass-plate';
  plate.setAttribute('aria-hidden', 'true');
  plate.style.backdropFilter = filter;
  plate.style.webkitBackdropFilter = filter;

  bar.style.backdropFilter = '';
  bar.style.webkitBackdropFilter = '';
  bar.insertBefore(plate, bar.firstChild);

  /* ---- 1b. The frost, under the plate ------------------------------------
     The bar refracts but does not diffuse, and that is what makes scrolled
     content read straight through it as a legible ghost image. The blur that
     was meant to do the diffusing is written by glass.js as the tail of one
     backdrop chain — `url(#droplet-N) blur(2px) saturate(1.7)` — and Chromium
     does not honour a CSS blur that follows an SVG `url()` in a
     `backdrop-filter`. Measured on the bar with the certificates strip
     passing under it: at blur(2px) the line behind the labels is readable, at
     blur(8px) it is readable, at blur(18px) it is *still* readable. The same
     blur alone, with the lens taken out of the chain, dissolves it completely.
     The declaration is accepted and the blur is dropped, silently.

     So the frost cannot live in that chain, and it must not be moved into the
     SVG filter either — appending an feGaussianBlur to the droplet chain made
     Chromium drop the whole filter, displacement included.

     It gets its own layer instead, painted *below* the plate. Two stacked
     backdrop-filters are not the compounding problem the plate exists to
     avoid: that one is about nesting, where a descendant samples its
     ancestor's already-flattened output and has nothing left to bend. These
     are siblings. This one frosts the page; the plate's backdrop is then that
     frosted result, and the lens bends it. Which is also the right order
     physically — light diffuses through the body of the glass and refracts at
     its curved surface, not the other way round.

     The lens above is left exactly as script.js tuned it. Nothing about the
     refraction changes; the only new thing is something for it to refract. */
  var frost = document.createElement('div');
  frost.className = 'nav-glass-frost';
  frost.setAttribute('aria-hidden', 'true');
  /* Kept in JS beside the plate it partners, not in the stylesheet, so the
     two layers of one material are read together. 16px is where the strip of
     project thumbnails stops resolving into separate tiles under the bar and
     becomes a wash of their colour; below ~12 the tiles come back. The
     saturate is small on purpose — the plate already carries glass.js's 1.7,
     and this only keeps the wash from going grey on the way through. */
  frost.style.backdropFilter = 'blur(16px) saturate(1.15)';
  frost.style.webkitBackdropFilter = frost.style.backdropFilter;
  bar.insertBefore(frost, plate);
  /* Set last, and only once the plate is really in place: the stylesheet keys
     every layout change in section 1 off this attribute, so the bar can never
     be caught mid-move with its rim already relocated to an element that does
     not exist yet. */
  bar.setAttribute('data-nav-glass', '');

  /* glass.js keeps a ResizeObserver on .header-inner and rebuilds the
     displacement map from its size. The plate is inset:0 inside that same
     element, so it stays exactly the size the map is built for and the
     observer needs no adjustment. */

  /* ---- 2. Lens the pills ------------------------------------------------
     Below the bar's breakpoint the links become a dropdown panel rather than a
     row of capsules, and a lens per item in a stacked menu is machinery
     bending a flat backdrop. styles.css switches at 720px. */
  if (mq && !mq('(min-width: 721px)').matches) return;

  var links = document.querySelectorAll('.nav-links a');
  if (!links.length) return;

  var LENS = {
    /* The capsule is ~38px tall — shallower than liquid-buttons' 48px pill, so
       the curved band is a smaller share of the object and the bend has less
       room before it starts tearing rather than warping. */
    band: 13,
    scale: 20,
    dispersion: 0.12,
    /* Glass is clear. The frost is what would hide the refraction. */
    blur: 0.5,
    saturate: 1.75,
    fallbackBlur: 4
  };

  /* ---- [nav-morph] handoff ----------------------------------------------
     When nav-morph.js is attached there are no longer seven capsules to lens
     — there is one, and it travels. Give it the lens and stop: the per-pill
     machinery below has nothing left to drive, and running it anyway would
     arm seven displacement maps for capsules the stylesheet no longer paints.

     This is strictly better than what it replaces. One map instead of seven,
     built once per destination rather than on first hover of each item; and
     the refraction now *moves*, which is the thing a fixed lens could never
     show — a real piece of glass crossing the bar and bending the page as it
     goes. The pill is a descendant of .header-inner and so needed the hoist
     above every bit as much as the links did.

     No lens is toggled off at rest here, unlike the pills: nav-morph.css
     fades the whole element to opacity 0 when the bar has nothing to point
     at, and an element at zero alpha composites nothing — so there is no
     pill-shaped hole to worry about. */
  var morphPill = document.querySelector('.nav-links[data-nav-morph] .nav-morph-pill');
  if (morphPill) {
    var morphLens = liquidGlass(morphPill, LENS);
    if (morphLens.supported) morphPill.setAttribute('data-lens', '');
    return;
  }

  /* Build the lens once, then keep the filter string and drive it by hand.
     Creating and destroying on every hover would rebuild a canvas displacement
     map each time; this pays that cost once, on first use. */
  function arm(el) {
    if (el.hasOwnProperty('__navGlass')) return el.__navGlass;
    var lens = liquidGlass(el, LENS);
    el.__navGlass = el.style.backdropFilter || null;
    /* Straight back off — the pill is bare at rest and must stay bare. */
    el.style.backdropFilter = '';
    el.style.webkitBackdropFilter = '';
    /* Only when the refraction is real. On Safari and Firefox liquidGlass
       falls back to a plain frost and reports supported:false, and the thinner
       tint data-lens selects would then be thinning a surface with nothing
       under it to justify the thinning — the same guard liquid-buttons.js
       applies to its own capsules. */
    if (lens.supported) el.setAttribute('data-lens', '');
    return el.__navGlass;
  }

  function show(el) {
    var f = arm(el);
    if (!f) return;
    el.style.backdropFilter = f;
    el.style.webkitBackdropFilter = f;
  }

  function hide(el) {
    el.style.backdropFilter = '';
    el.style.webkitBackdropFilter = '';
  }

  /* The two states the stylesheet draws a capsule for. Hover and focus are
     transient; is-active is owned by script.js's scroll spy, so it is watched
     rather than listened for. */
  function sync(el) {
    if (el.classList.contains('is-active') || el.matches(':hover') || el === document.activeElement) {
      show(el);
    } else {
      hide(el);
    }
  }

  Array.prototype.forEach.call(links, function (a) {
    a.addEventListener('mouseenter', function () { show(a); });
    a.addEventListener('mouseleave', function () { sync(a); });
    a.addEventListener('focus', function () { show(a); });
    a.addEventListener('blur', function () { sync(a); });
  });

  var mo = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) sync(records[i].target);
  });

  Array.prototype.forEach.call(links, function (a) {
    mo.observe(a, { attributes: true, attributeFilter: ['class'] });
    /* The scroll spy may already have marked one before this file ran. */
    if (a.classList.contains('is-active')) show(a);
  });
})();
