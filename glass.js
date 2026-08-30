/*
 * Liquid glass — a water-droplet lens for any element.
 *
 * The effect is real refraction, not a blur: a displacement map bends the live
 * backdrop through `backdrop-filter: url(#filter)`, so text passing underneath
 * warps the way it does through the rim of a water droplet.
 *
 * The map is built from a signed distance field of the element's rounded rect.
 * Displacement runs along the surface normal and follows a spherical profile —
 * strongest exactly at the rim, decaying smoothly to nothing before the flat
 * centre. The smooth decay is the important part: a map that ends abruptly
 * tears a hard seam through anything crossing the boundary.
 *
 * Chromium is currently the only engine that runs an SVG filter inside
 * backdrop-filter; everywhere else falls back to a plain frosted blur.
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var uid = 0;
  var defs = null;

  var supported = (function () {
    if (typeof CSS === 'undefined' || !CSS.supports) return false;
    var ua = navigator.userAgent;
    var isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
    if (isSafari || /Firefox/.test(ua)) return false;
    return CSS.supports('backdrop-filter', 'url(#g)');
  })();

  function ensureDefs() {
    if (defs) return defs;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;pointer-events:none';
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return defs;
  }

  // Signed distance to a rounded rectangle centred on the origin.
  // Negative inside, zero on the edge, positive outside.
  function sdRoundRect(px, py, hw, hh, r) {
    var qx = Math.abs(px) - (hw - r);
    var qy = Math.abs(py) - (hh - r);
    var ax = qx > 0 ? qx : 0;
    var ay = qy > 0 ? qy : 0;
    var outside = Math.sqrt(ax * ax + ay * ay);
    var inside = Math.min(Math.max(qx, qy), 0);
    return outside + inside - r;
  }

  function buildMap(w, h, radius, band) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(w, h);
    var data = img.data;

    var hw = w / 2;
    var hh = h / 2;
    var r = Math.min(radius, hw, hh);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var px = x - hw + 0.5;
        var py = y - hh + 0.5;

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
            // 1 at the rim, 0 where the lens flattens out.
            var t = 1 - depth / band;
            // Spherical cap: gentle across the flat, steep right at the rim —
            // the profile of a droplet's edge.
            var mag = 1 - Math.sqrt(Math.max(0, 1 - t * t));
            nx = (gx / len) * mag;
            ny = (gy / len) * mag;
          }
        }

        var i = (y * w + x) << 2;
        data[i] = Math.round(128 + nx * 127);
        data[i + 1] = Math.round(128 + ny * 127);
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  function readRadius(el, w, h, override) {
    if (override != null) return override;
    var raw = getComputedStyle(el).borderTopLeftRadius || '0px';
    var v = parseFloat(raw) || 0;
    return raw.trim().slice(-1) === '%' ? (v / 100) * Math.min(w, h) : v;
  }

  function liquidGlass(el, opts) {
    var o = Object.assign(
      {
        band: 18,
        scale: 42,
        // Fraction by which red and blue displacement differ from green. Keep
        // it small — this is a rim fringe, not a prism.
        dispersion: 0.08,
        blur: 3,
        saturate: 1.7,
        radius: null,
        fallbackBlur: 6,
      },
      opts
    );

    if (!supported) {
      var frosted = 'blur(' + o.fallbackBlur + 'px) saturate(' + o.saturate + ')';
      el.style.backdropFilter = frosted;
      el.style.webkitBackdropFilter = frosted;
      return {
        supported: false,
        refresh: function () {},
        setScale: function () {}, /* [droplet] */
        destroy: function () {},
      };
    }

    var id = 'droplet-' + ++uid;
    var filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');
    // Filters default to linearRGB, which shifts the map's neutral 128 and
    // injects a constant phantom offset across the whole surface.
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    var feImage = document.createElementNS(SVG_NS, 'feImage');
    feImage.setAttribute('result', 'map');
    feImage.setAttribute('preserveAspectRatio', 'none');
    filter.appendChild(feImage);

    // [droplet] Each pass is kept alongside its share of the base scale, so
    // setScale() below can re-drive the whole stack from one multiplier
    // without losing the per-channel dispersion spread.
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
      passes.push({ node: d, base: scale }); /* [droplet] */
      return d;
    }

    if (!o.dispersion) {
      displacePass(o.scale);
    } else {
      // Chromatic aberration. Short wavelengths have a higher refractive index,
      // so blue bends furthest and red least — each channel gets its own
      // displacement pass, then they're recombined.
      //
      // This reads as a rim effect rather than a rainbow wash because the map
      // is already neutral across the flat centre: where there's no bend there
      // can be no split, so the fringe only appears where the lens curves.
      var keep = [
        '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
        '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
        '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
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

      // Isolated channels are disjoint, so screen recombines them losslessly.
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
      filter.appendChild(b2);
    }

    ensureDefs().appendChild(filter);

    var lastW = 0;
    var lastH = 0;

    function refresh() {
      var w = Math.round(el.offsetWidth);
      var h = Math.round(el.offsetHeight);
      if (!w || !h || (w === lastW && h === lastH)) return;
      lastW = w;
      lastH = h;
      feImage.setAttribute('href', buildMap(w, h, readRadius(el, w, h, o.radius), o.band));
      feImage.setAttribute('width', w);
      feImage.setAttribute('height', h);
    }

    refresh();
    el.style.backdropFilter =
      'url(#' + id + ') blur(' + o.blur + 'px) saturate(' + o.saturate + ')';

    var timer = null;
    var ro = new ResizeObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(refresh, 120);
    });
    ro.observe(el);

    return {
      supported: true,
      refresh: refresh,
      // [droplet] Re-drive every displacement pass from one multiplier: 1 is
      // the configured bend, higher bends harder. Animating this is the only
      // way to deepen the refraction itself — a CSS transform scales the
      // element, not the lens.
      setScale: function (mult) {
        for (var i = 0; i < passes.length; i++) {
          passes[i].node.setAttribute('scale', passes[i].base * mult);
        }
      },
      destroy: function () {
        ro.disconnect();
        clearTimeout(timer);
        filter.remove();
        el.style.backdropFilter = '';
      },
    };
  }

  global.liquidGlass = liquidGlass;
})(window);
