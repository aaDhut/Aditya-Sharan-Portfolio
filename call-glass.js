/* ==========================================================================
   Call glass — full liquid glass for the booking button and its pop-up
   ==========================================================================

   Self-contained and removable: see REMOVE-CALL-GLASS.md.

   glass.js already bends the live *backdrop* through a signed-distance-field
   lens, and this file reuses it unchanged for that half. What it adds is the
   half `backdrop-filter` cannot do:

     contentLens()  — the same SDF profile applied as `filter:` instead, so an
                      element's *own* content deforms at the rim. That is what
                      drags the picker's text into the panel edge, split into
                      its channels. The button's label is deliberately not
                      lensed; see the note where it is built.

   Division of labour with call-glass.css:
     - the bend of the backdrop and the bend of the content are SVG lenses,
       driven from here
     - everything painted *on* the surface — tint, rim, specular, squash — is
       ordinary CSS over there

   Nothing in glass.js, meeting-picker.* or call-popup.* is edited, and nothing
   there knows this file exists. Like call-popup.js, this sets the hook its own
   stylesheet is scoped under (data-glass), so the CSS is inert rather than
   half-applied if the script fails to load.
   ========================================================================== */

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var uid = 0;
  var defs = null;

  /* ---- Shared SVG defs ---------------------------------------------------

     One hidden <svg> for every filter this file makes, appended to <body> so
     it is removed with the script's own DOM and leaves nothing behind. */
  function ensureDefs() {
    if (defs) return defs;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('data-call-glass', '');
    svg.style.cssText = 'position:absolute;pointer-events:none';
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return defs;
  }

  /* Signed distance to a rounded rectangle centred on the origin. Negative
     inside, zero on the edge, positive outside. Same function glass.js uses —
     restated rather than exported from there, so that file stays untouched and
     either one can be deleted without breaking the other. */
  function sdRoundRect(px, py, hw, hh, r) {
    var qx = Math.abs(px) - (hw - r);
    var qy = Math.abs(py) - (hh - r);
    var ax = qx > 0 ? qx : 0;
    var ay = qy > 0 ? qy : 0;
    var outside = Math.sqrt(ax * ax + ay * ay);
    var inside = Math.min(Math.max(qx, qy), 0);
    return outside + inside - r;
  }

  /* ---- The map -----------------------------------------------------------

     A displacement map for a rounded rect of `rectW` x `rectH`, drawn into a
     canvas of `mapW` x `mapH` whose top-left sits at (-offX, -offY) relative
     to the rect.

     The offset is the whole reason this is not glass.js's buildMap. The label
     span sits inset inside the pill by the button's padding, but the light
     bends according to the *pill's* curve, not the span's box — so the map has
     to describe a rect the filtered element is only a part of.

     `dir` is +1 to bend outward (content pinches toward the rim, pulling text
     into the edge) or -1 to bend inward (content magnifies, and nothing is
     sampled from outside the source, so no lip is eaten off the edge).

     `res` renders at a fraction of device pixels. The profile is a smooth
     curve with no detail to lose, feImage scales it back up with
     preserveAspectRatio="none", and it turns the panel's ~250k-pixel loop into
     ~60k. */
  function buildMap(rectW, rectH, radius, band, offX, offY, mapW, mapH, dir, res, power) {
    var cw = Math.max(1, Math.round(mapW * res));
    var ch = Math.max(1, Math.round(mapH * res));

    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;

    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(cw, ch);
    var data = img.data;

    var hw = rectW / 2;
    var hh = rectH / 2;
    var r = Math.min(radius, hw, hh);
    var sx = mapW / cw;
    var sy = mapH / ch;

    for (var y = 0; y < ch; y++) {
      for (var x = 0; x < cw; x++) {
        /* Canvas pixel -> map space -> rect space, where the SDF is centred. */
        var px = (x + 0.5) * sx - offX - hw;
        var py = (y + 0.5) * sy - offY - hh;

        // Depth into the glass from the nearest edge.
        var depth = -sdRoundRect(px, py, hw, hh, r);
        var nx = 0;
        var ny = 0;

        if (depth >= 0 && depth < band) {
          // Surface normal from the SDF gradient.
          var e = 1;
          var gx =
            sdRoundRect(px + e, py, hw, hh, r) - sdRoundRect(px - e, py, hw, hh, r);
          var gy =
            sdRoundRect(px, py + e, hw, hh, r) - sdRoundRect(px, py - e, hw, hh, r);
          var len = Math.sqrt(gx * gx + gy * gy);

          if (len > 0.00001) {
            // 1 at the rim, 0 where the lens flattens out. The smooth decay is
            // the important part: a map that ends abruptly tears a hard seam
            // through any letterform crossing the boundary.
            var t = 1 - depth / band;
            /* Two profiles, and which one to use is decided by how much room
               the content has.

               power 0 is a spherical cap — gentle across the flat, steep right
               at the rim. That is what a thick slab of glass does, and it is
               right for the panel, where there is 60px of curved rim to spend
               and the text only meets the outer half of it.

               Anything else is t^power, which spreads the same bend evenly
               across the band. The pill needs it: a 49px capsule sets its
               label in the flat middle, where a spherical profile has decayed
               to about 4% and the text simply does not move. */
            var mag =
              (power ? Math.pow(t, power) : 1 - Math.sqrt(Math.max(0, 1 - t * t))) *
              dir;
            nx = (gx / len) * mag;
            ny = (gy / len) * mag;
          }
        }

        var i = (y * cw + x) << 2;
        data[i] = Math.round(128 + nx * 127);
        data[i + 1] = Math.round(128 + ny * 127);
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  function setHref(node, value) {
    node.setAttribute('href', value);
    // Safari < 16 only honours the xlink form on feImage.
    node.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', value);
  }

  /* ---- contentLens -------------------------------------------------------

     Applies the lens to the element's own rendering rather than its backdrop.

     Unlike backdrop refraction, `filter: url()` runs in every engine — so the
     text deform and its chromatic split are the parts of this effect that
     Safari and Firefox also get.

     opts:
       band        px of curved rim the deform reaches into. A number, or a
                   function of the geometry — a capsule wants exactly half its
                   height, so that the profile reaches zero on the medial axis
                   where the surface normal flips. A band any wider than that
                   tears a seam straight down the middle of the object.
       power       0 for the spherical rim profile, or the exponent of an even
                   one spread across the whole band
       scale       px of displacement at the rim
       dispersion  fraction by which R and B differ from G
       dir         +1 pinch outward, -1 magnify inward
       res         map resolution, 0..1
       margin      px of neutral map kept outside the rect, so anything
                   painted beyond the border box (a shadow, a focus ring) is
                   carried through untouched instead of being clipped away
       geometry()  returns { w, h, radius, offX, offY } — the rect the light
                   bends around, in the filtered element's coordinate space.
                   Defaults to the element's own border box. */
  function contentLens(el, opts) {
    var o = Object.assign(
      {
        band: 30,
        power: 0,
        scale: 20,
        dispersion: 0.24,
        dir: 1,
        res: 0.6,
        margin: 0,
        geometry: null,
      },
      opts
    );

    var id = 'cg-lens-' + ++uid;
    var filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    // Filters default to linearRGB, which shifts the map's neutral 128 and
    // injects a constant phantom offset across the whole surface.
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    // userSpaceOnUse so the region can be stated in the element's own pixels —
    // objectBoundingBox cannot express a margin or an off-element rect.
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('primitiveUnits', 'userSpaceOnUse');

    var feImage = document.createElementNS(SVG_NS, 'feImage');
    feImage.setAttribute('result', 'map');
    feImage.setAttribute('preserveAspectRatio', 'none');
    filter.appendChild(feImage);

    // Each pass keeps its share of the base scale so setScale() can re-drive
    // the whole stack from one multiplier without losing the dispersion spread.
    var passes = [];

    function displacePass(scale, result) {
      var d = document.createElementNS(SVG_NS, 'feDisplacementMap');
      d.setAttribute('in', 'SourceGraphic');
      d.setAttribute('in2', 'map');
      d.setAttribute('scale', scale);
      d.setAttribute('xChannelSelector', 'R');
      d.setAttribute('yChannelSelector', 'G');
      if (result) d.setAttribute('result', result);
      filter.appendChild(d);
      passes.push({ node: d, base: scale });
    }

    if (!o.dispersion) {
      displacePass(o.scale);
    } else {
      /* Chromatic aberration. Short wavelengths have a higher refractive
         index, so blue bends furthest and red least — each channel gets its
         own displacement pass, then they are recombined.

         On content this reads as a coloured fringe on the letterforms nearest
         the rim and nothing at all across the middle, because the map is
         already neutral over the flat centre: where there is no bend there can
         be no split. */
      /* Each matrix keeps one channel and forces alpha to 1 — the last column
         of the alpha row is a constant, not a multiplier on A.

         Forcing it is the whole trick, and it is where this differs from the
         backdrop lens in glass.js. That one screens the three passes together
         with their own alpha, which is exact because a backdrop is opaque.
         Content is not: screen's alpha union (a -> 3a - 3a^2 + a^3) inflates
         every partly-transparent pixel, and un-premultiplying against the
         inflated alpha drags its colour toward black. A 50%-white fill comes
         out a 87%-opaque grey. Flattening alpha here keeps the three passes
         purely about colour; coverage is restored in one step below. */
      var keep = [
        '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1',
        '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1',
        '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 1',
      ];
      var factors = [1 - o.dispersion, 1, 1 + o.dispersion];
      var parts = [];

      for (var c = 0; c < 3; c++) {
        displacePass(o.scale * factors[c], 'd' + c);
        var cm = document.createElementNS(SVG_NS, 'feColorMatrix');
        cm.setAttribute('in', 'd' + c);
        cm.setAttribute('type', 'matrix');
        cm.setAttribute('values', keep[c]);
        cm.setAttribute('result', 'c' + c);
        filter.appendChild(cm);
        parts.push('c' + c);
      }

      // Opaque and channel-disjoint, so screen recombines them losslessly.
      var b1 = document.createElementNS(SVG_NS, 'feBlend');
      b1.setAttribute('in', parts[0]);
      b1.setAttribute('in2', parts[1]);
      b1.setAttribute('mode', 'screen');
      b1.setAttribute('result', 'c01');
      filter.appendChild(b1);

      var b2 = document.createElementNS(SVG_NS, 'feBlend');
      b2.setAttribute('in', 'c01');
      b2.setAttribute('in2', parts[2]);
      b2.setAttribute('mode', 'screen');
      b2.setAttribute('result', 'rgb');
      filter.appendChild(b2);

      /* Coverage comes from the middle pass alone — one alpha for a pixel that
         now holds three differently-bent channels. Where red landed on empty
         space and green did not, red is simply missing from an otherwise solid
         pixel, and it reads as a cyan fringe on that side of the letterform.
         That *is* the aberration: a colour shift along the edge rather than a
         halo grown outside it, which is what an RGB split on text looks like. */
      var comp = document.createElementNS(SVG_NS, 'feComposite');
      comp.setAttribute('in', 'rgb');
      comp.setAttribute('in2', 'd1');
      comp.setAttribute('operator', 'in');
      filter.appendChild(comp);
    }

    ensureDefs().appendChild(filter);

    var last = '';

    function geometry() {
      if (o.geometry) return o.geometry();
      var raw = getComputedStyle(el).borderTopLeftRadius || '0px';
      var v = parseFloat(raw) || 0;
      var w = el.offsetWidth;
      var h = el.offsetHeight;
      return {
        w: w,
        h: h,
        radius: raw.trim().slice(-1) === '%' ? (v / 100) * Math.min(w, h) : v,
        offX: 0,
        offY: 0,
      };
    }

    function refresh() {
      var g = geometry();
      if (!g || !g.w || !g.h) return;

      /* The region has to cover the filtered element, not just the rect the
         light bends around — the label span is narrower than its pill, and a
         region sized to the pill alone would clip nothing while a region sized
         to the span would leave the pill's ends out of the map. Union of both,
         grown by the margin. */
      var x0 = Math.min(-g.offX, 0) - o.margin;
      var y0 = Math.min(-g.offY, 0) - o.margin;
      var x1 = Math.max(-g.offX + g.w, el.offsetWidth) + o.margin;
      var y1 = Math.max(-g.offY + g.h, el.offsetHeight) + o.margin;

      var mapW = Math.round(x1 - x0);
      var mapH = Math.round(y1 - y0);
      if (mapW <= 0 || mapH <= 0) return;

      /* Rebuilding costs a full pixel loop and a toDataURL, so skip it when
         nothing that shapes the map has actually moved. */
      var band = typeof o.band === 'function' ? o.band(g) : o.band;

      var key = [g.w, g.h, g.radius, g.offX, g.offY, mapW, mapH, band].join(':');
      if (key === last) return;
      last = key;

      filter.setAttribute('x', x0);
      filter.setAttribute('y', y0);
      filter.setAttribute('width', mapW);
      filter.setAttribute('height', mapH);

      feImage.setAttribute('x', x0);
      feImage.setAttribute('y', y0);
      feImage.setAttribute('width', mapW);
      feImage.setAttribute('height', mapH);

      setHref(
        feImage,
        buildMap(
          g.w,
          g.h,
          g.radius,
          band,
          // Where the rect's top-left sits inside the map.
          -g.offX - x0,
          -g.offY - y0,
          mapW,
          mapH,
          o.dir,
          o.res,
          o.power
        )
      );
    }

    refresh();

    var timer = null;
    var ro = new ResizeObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(refresh, 120);
    });
    ro.observe(el);

    return {
      id: id,
      css: 'url(#' + id + ')',
      refresh: refresh,
      /* Re-drive every pass from one multiplier: 1 is the configured bend,
         higher bends harder. Animating this is the only way to deepen the
         refraction itself — a CSS transform scales the element, not the lens. */
      setScale: function (mult) {
        for (var i = 0; i < passes.length; i++) {
          passes[i].node.setAttribute('scale', passes[i].base * mult);
        }
      },
      destroy: function () {
        ro.disconnect();
        clearTimeout(timer);
        filter.remove();
      },
    };
  }

  /* ======================================================================
     Wiring
     ====================================================================== */

  var root = document.querySelector('.mp');
  if (!root) return;

  var toggle = root.querySelector('.mp-toggle');
  var collapse = root.querySelector('.mp-collapse');
  var panel = root.querySelector('.mp-panel');
  /* The wrapper .mp-collapse has always had, and the element that becomes the
     glass surface. Checked rather than assumed: if the picker's markup ever
     loses the wrapper, `slab` would come back as .mp-panel itself and this
     would strip the panel of the material it was about to move onto it. */
  var slab = collapse ? collapse.firstElementChild : null;
  if (!toggle || !collapse || !panel || !slab) return;
  if (slab === panel || !slab.contains(panel)) return;

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Decided once, at load. Both hand the panel back to call-popup.css's opaque
     treatment, which is the accessible answer and is already written — so
     nothing below runs, the hook is never set, and every rule in
     call-glass.css stays inert. */
  var plain = window.matchMedia(
    '(prefers-reduced-transparency: reduce), (prefers-contrast: more)'
  );
  if (plain.matches) return;

  slab.classList.add('cg-slab');

  /* The hook every rule in call-glass.css is scoped under. Set from here so a
     page that loads the stylesheet but fails to load this script keeps
     call-popup.css's opaque panel rather than getting a transparent one with
     no lens in it. */
  root.setAttribute('data-glass', 'on');

  /* ---- The label ---------------------------------------------------------

     The button's text gets its own element so it can be addressed without
     touching the pill's rim or its shadow. Wrapped here rather than in
     index.html so removing this feature is deleting files, with no markup to
     unpick. The ::after caret is a sibling of the span and is left alone. */
  var label = document.createElement('span');
  label.className = 'cg-label';

  while (toggle.firstChild) label.appendChild(toggle.firstChild);
  toggle.appendChild(label);

  /* ---- Backdrop refraction ----------------------------------------------

     glass.js unchanged, which is also where the Safari/Firefox fallback to a
     plain frosted blur comes from. */
  var pillLens = null;

  if (typeof liquidGlass === 'function') {
    pillLens = liquidGlass(toggle, {
      // The pill is ~49px tall, so the curved band is most of the object
      // rather than a thin edge on a wide bar.
      band: 22,
      /* Kept well inside the band, which is the mistake this started out
         making. Chromium captures the backdrop clipped to the element, so a
         displacement larger than the band it is spread over sends the rim
         sampling outside that capture entirely — and each channel runs off it
         at a different offset, which paints a saturated rainbow smear along
         the bottom edge and around the ends. At 60, swollen to 93 on hover
         against a 49px capsule, that is most of the object.

         Nothing is lost by pulling it in. Unlike the hero buttons over the orb
         field, this one sits on a flat section, and a flat backdrop looks the
         same however hard it is bent — the rim and the label are what sell the
         glass here. The bend is kept so that it is real wherever the button
         does cross something.

         Raised from 14 now that the painted conic ring is gone. That ring was
         standing in for dispersion, and with it removed the split has to be
         real to be seen at all — but the ceiling above is a real one, so this
         stays well under it rather than chasing the header's 130 on a capsule
         a third of its height. */
      scale: 26,
      // The header's, rather than the 0.2 that was fighting a painted ring.
      dispersion: 0.15,
      // A droplet is clear. The 7px frost .btn-secondary carries is exactly
      // what would hide the refraction underneath.
      blur: 0.5,
      saturate: 1.9,
      fallbackBlur: 3.5,
    });

    liquidGlass(slab, {
      /* The header's proportions rather than a panel's. .header-inner runs
         band 30 / scale 130 — displacement about 4x the band it is spread
         over, which is what makes its rim visibly bend the page behind it
         instead of just tinting it. This is the same shape of number, held
         back to ~2.7x because the panel's rim is a thin edge on a large pane
         rather than most of a 60px bar. */
      band: 40,
      scale: 110,
      dispersion: 0.15,
      /* Halved, from 13. The old value was the frosted-card setting: it turned
         the page behind the panel into a wash, which also dissolved the very
         refraction the lens above is creating. Now the panel is a window with
         a lens in it, like the header — the tint in call-glass.css is what
         keeps the six dials readable. */
      blur: 6.5,
      saturate: 1.8,
      fallbackBlur: 10,
      radius: 18,
    });
  }

  /* ---- Content deform ----------------------------------------------------

     The label is deliberately NOT lensed.

     It used to be: a contentLens at dispersion 0.38 magnified "Book a 30-min
     call" through the pill's curve, which is physically the right idea and
     visually the wrong one. Nine-tenths of that label sits across the flat
     centre of the capsule where the map is neutral, so the deform bought
     nothing there; what it did buy was a per-channel split on 15px letterforms
     — a red/cyan fringe on every stem, which at this size does not read as
     glass, it reads as text that has gone soft. The header's nav labels sit on
     the same material with no filter on them at all, and they are crisp.

     Only the label is exempt. The panel's content is lensed below, where the
     object is large enough for the deform to happen at an edge and leave the
     middle alone. */

  /* The panel bends *outward*, so text is stretched and split into the rim as
     it approaches. The lip that sampling outward eats lands in the panel's own
     padding, where there is nothing to lose — and the slab behind it owns the
     border, so the rim itself stays a crisp hairline.

     Radius and offset come from the panel's own box here; the slab is the same
     rect inflated by its 1px border, which is below the resolution of a 40px
     band. */
  var panelLens = contentLens(panel, {
    /* Wide enough that the deform is already under way where the content
       starts — the panel's padding is 22px, so a band that only reached 40
       spent most of itself on empty margin. */
    band: 90,
    /* Held down by the selection band rather than by the text. The band is a
       solid shape whose ends sit at the panel's content edge, so it takes the
       steepest part of the profile and smears into the rim; the picker's text
       would happily carry twice this. */
    scale: 28,
    dispersion: 0.16,
    dir: 1,
    res: 0.55,
    margin: 0,
  });

  /* Only while it is up. A filter this size is re-rasterised every time
     anything inside the panel repaints — and six of the things inside it are
     scroll containers — so it is not left switched on behind a closed panel. */
  function setPanelFilter(on) {
    panel.style.filter = on ? panelLens.css : '';
    panel.style.willChange = on ? 'filter' : '';
  }

  setPanelFilter(root.getAttribute('data-open') === 'true');

  /* Watching data-open rather than binding the toggle is what keeps this file
     independent of meeting-picker.js and call-popup.js — there is no ordering
     to get right between three click handlers on one button. */
  new MutationObserver(function () {
    var open = root.getAttribute('data-open') === 'true';
    if (open) panelLens.refresh();
    setPanelFilter(open);
  }).observe(root, { attributes: true, attributeFilter: ['data-open'] });

  /* ---- Swell -------------------------------------------------------------

     On hover the displacement ramps up, so the backdrop and the label visibly
     bend *harder* as the pointer arrives. A CSS transform scales the element;
     only this scales the refraction. */
  var SWELL = 1.4;
  var current = 1;
  var target = 1;
  var swelling = false;

  function step() {
    // Exponential smoothing rather than a fixed tween: a pointer that leaves
    // mid-ramp reverses from wherever it got to, with no bookkeeping.
    current += (target - current) * 0.18;

    if (Math.abs(target - current) < 0.004) {
      current = target;
      swelling = false;
    }

    if (pillLens) pillLens.setScale(current);
    if (swelling) requestAnimationFrame(step);
  }

  function swellTo(next) {
    if (calm.matches) return;
    target = next;
    if (swelling || current === target) return;
    swelling = true;
    requestAnimationFrame(step);
  }

  /* ---- Glint -------------------------------------------------------------

     A collaboration with the stylesheet: this writes the pointer position into
     --gx/--gy, call-glass.css decides what light to make of it. */
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var HOME_X = 0.5;
  var HOME_Y = 0.12;
  var queued = false;
  var pending = null;

  function writeGlint() {
    queued = false;
    if (!pending) return;
    toggle.style.setProperty('--gx', pending.x);
    toggle.style.setProperty('--gy', pending.y);
  }

  function queue(next) {
    pending = next;
    if (queued) return;
    queued = true;
    requestAnimationFrame(writeGlint);
  }

  toggle.addEventListener('pointerenter', function () {
    swellTo(SWELL);
  });

  toggle.addEventListener('pointermove', function (ev) {
    if (calm.matches || !fine.matches) return;
    var r = toggle.getBoundingClientRect();
    if (!r.width || !r.height) return;
    queue({
      x: ((ev.clientX - r.left) / r.width).toFixed(3),
      y: ((ev.clientY - r.top) / r.height).toFixed(3),
    });
  });

  toggle.addEventListener('pointerleave', function () {
    swellTo(1);
    queue({ x: HOME_X, y: HOME_Y });
  });

  // Keyboard parity: tabbing to the button gets the same object the pointer
  // would get.
  toggle.addEventListener('focus', function () {
    if (toggle.matches(':focus-visible')) swellTo(SWELL);
  });

  toggle.addEventListener('blur', function () {
    swellTo(1);
    queue({ x: HOME_X, y: HOME_Y });
  });
})();
