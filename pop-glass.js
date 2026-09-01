/*
 * [pop-glass] Liquid glass on the link preview panels.
 *
 * Attaches the droplet lens from glass.js to the five .link-pop panels — the
 * four ArtStation portfolio pop-ups on the Experience work tiles, and the
 * résumé preview under the hero — and flips the data-pg attribute that lets
 * pop-glass.css paint the surface around it.
 *
 * The material, the rim, the fringe and the opaque image plate are all in
 * pop-glass.css. This file owns exactly two things: the refraction, and when
 * it is allowed to exist.
 *
 * Chromium is the only engine that runs an SVG filter inside backdrop-filter;
 * glass.js falls back to a plain frosted blur everywhere else, which is still
 * the right surface, just without the bend.
 *
 * Remove by deleting this file, pop-glass.css and their two tags in
 * index.html. See REMOVE-POP-GLASS.md.
 */
(function () {
  'use strict';

  if (typeof liquidGlass !== 'function') return;

  var panels = document.querySelectorAll('.link-pop');
  if (!panels.length) return;

  /* Three reasons never to light a panel at all. Each has a matching block in
     pop-glass.css that catches the case where the preference is changed after
     a panel is already lit — this is the cheaper path, which is to not build
     the surface in the first place.

     The hover check is the load-bearing one. styles.css hides .link-pop
     outright under (hover: none), so on a phone every one of these would be a
     displacement map built for a panel that can never be seen. */
  function blocked() {
    return (
      window.matchMedia('(hover: none)').matches ||
      window.matchMedia('(prefers-reduced-transparency: reduce)').matches ||
      window.matchMedia('(prefers-contrast: more)').matches
    );
  }

  if (blocked()) return;

  panels.forEach(function (panel) {
    /* The trigger is the group the panel lives in — .work-link for a tile,
       .resume-link for the hero button — because that is what CSS watches
       with :hover / :focus-within to open the panel. Listening on the panel
       itself would be too late: it is only hoverable once it is open. */
    var group = panel.closest('.work-link, .resume-link');
    if (!group) return;

    var lit = false;

    /* Deferred to the first hover, which is the same trigger script.js
       already uses to hold back the panel's couple of megabytes of
       screenshots. The reason is the same shape but not the same cost:
       there, an unopened panel would have downloaded images nobody asked
       for; here, it would hold a backdrop-filter compositing layer for the
       life of the page. [scroll-paint] is the precedent — ~33 of those on
       .timeline-item was enough for Chrome to start dropping cards
       mid-scroll and painting them as flat fills.

       There is no visible cost to waiting. The panel sits behind a 0.12s
       transition delay before it even begins to fade in, so the map is built
       and the filter is on the element several frames before there is
       anything on screen to look through. */
    function light() {
      if (lit) return;
      lit = true;

      /* Before the lens, so the tint and rim are already on the element when
         glass.js writes the filter — one style recalculation instead of two,
         and no frame in which a blurred panel has no surface. */
      panel.dataset.pg = 'lit';

      var lens = liquidGlass(panel, {
        /* .cg-slab's proportions. That panel and this one are the same kind
           of object: a floating pane a few hundred pixels across whose rim is
           a thin edge on a large surface, rather than a capsule that is
           mostly rim. Its numbers were tuned against exactly that and there
           is no reason for this one to disagree with it.

           Held at ~2.7x displacement over the band it is spread across, where
           .header-inner runs 4.3x. The header can afford more because it is a
           60px bar that is nearly all rim; on a 400px-tall panel that ratio
           would send the rim sampling outside Chromium's element-clipped
           backdrop capture, and the fringe stops being a fringe at that point
           — it becomes a saturated smear along the bottom edge. */
        band: 40,
        scale: 110,

        /* Twice the header's 0.15, matching the call slab: three passes of the
           same map, each channel bent by a different amount. The outer channel
           lands at scale 147 against a 40px band, 3.7x, still inside the
           header's own 4.3x and so still inside the capture.

           This is the half of the edge that lives and moves with the page
           behind it. It needs the painted fringe in pop-glass.css beside it
           because these panels open over a timeline card that is often flat
           where the rim crosses it, and a lens with nothing to split shows
           nothing. */
        dispersion: 0.34,

        /* A twelfth of an ordinary panel frost — a quarter of what this panel
           originally carried. Barely frost at all: heavy blur dissolves the
           very refraction the lens is creating, so at this weight the bend is
           the effect and the blur is only taking the hard edges off what is
           behind. Separating the panel from the body copy and bullet list
           underneath is now almost entirely the tint and rim in
           pop-glass.css. */
        blur: 1.21875,
        saturate: 1.8,

        /* Safari and Firefox get this instead of everything above. Kept
           heavier than the lens's own blur, since it is now doing the whole
           job of separating the panel from the text underneath without any
           refraction to help. */
        fallbackBlur: 1.75,
      });

      /* The panel is laid out at rest — visibility:hidden keeps its box — so
         glass.js measured the right size on attach. But the strip is empty
         until script.js swaps in the screenshots on this same first hover,
         and the panel grows by a few hundred pixels when they land. glass.js
         watches for that with a ResizeObserver and rebuilds the map, so there
         is nothing to do here; the note is for the next person to wonder why
         a lens built against a 50px-tall panel ends up correct. */
      void lens;
    }

    group.addEventListener('pointerenter', light);
    group.addEventListener('focusin', light);
  });
})();
