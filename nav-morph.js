/*
 * nav-morph.js — [nav-morph] Removable feature.
 *
 * One capsule for the whole nav, moved by springs instead of seven capsules
 * crossfading in place. It follows the hovered item, or — when nothing is
 * hovered — the section the scroll spy in script.js says you are standing in.
 *
 * The three decisions that matter, and why:
 *
 *   FLIP, not width animation. Animating `left`/`width` per frame is a layout
 *   pass per frame on an element inside the sticky bar. Instead the pill's box
 *   is parked at the *destination* on every retarget and a transform is used
 *   as the inverse that pulls it back onto where it currently is; the spring
 *   then runs that inverse to identity. Everything per frame is one transform
 *   and two custom properties, and the pill lands pixel-exact on the target
 *   because identity *is* the target — not wherever an interpolator stopped.
 *
 *   A real spring, not a CSS transition. This is the load-bearing choice.
 *   Scroll quickly through two sections and the pill has to change destination
 *   mid-flight while keeping the velocity it already has. A CSS transition
 *   restarts from a standstill on every retarget, which is exactly the dead,
 *   re-triggered feel this feature exists to remove. An integrated spring
 *   retargets by changing one number and carries its own momentum through.
 *
 *   Two edge springs, not one position spring. The left and right edges are
 *   integrated separately with different stiffness, and the leading edge is
 *   the stiff one. Moving right, the right edge leaves first and the left edge
 *   drags: the capsule elongates while it travels and contracts as the trailer
 *   catches up. Nothing computes a "stretch" — that shape is simply what two
 *   springs of different stiffness do, which is why it reads as a liquid and
 *   not as a rectangle with a scale keyframe on it.
 *
 * Everything is guarded. No list, no links, a narrow viewport, or Reduce
 * Motion each take their own path out, and the stylesheet keys every rule off
 * the data-nav-morph attribute this sets — so a page where this did not run is
 * exactly the page it was.
 *
 * Loads *before* nav-glass.js on purpose: nav-glass hands its displacement
 * lens to this pill when it finds one, and can only find one that already
 * exists. See REMOVE-NAV-MORPH.md.
 */
(function () {
  'use strict';

  var mq = window.matchMedia;

  /* Below 720px styles.css turns the list into a fixed dropdown and the items
     stack. Bail before the attribute is set, so the stylesheet's suppression
     rules never apply and the per-item capsules stay in charge down there.
     A page loaded narrow and then widened keeps the old capsules for the rest
     of its life, which is the same trade nav-glass.js makes — the alternative
     is standing up the whole rig on a resize handler for a case that costs a
     reload to fix. */
  if (mq && !mq('(min-width: 721px)').matches) return;

  var list = document.querySelector('.nav-links');
  if (!list) return;

  var links = list.querySelectorAll('a');
  if (!links.length) return;

  var reduceMotion = mq && mq('(prefers-reduced-motion: reduce)').matches;

  /* ---- Spring constants --------------------------------------------------
     Stiffness in 1/s², damping in 1/s. The leader is under-damped enough to
     overshoot its mark by a hair and settle back — that overshoot is the
     "pop past and land" in the macOS original, and taking it out makes the
     travel accurate and lifeless. The trailer is softer in both terms, so it
     arrives late; the gap between them *is* the stretch. */
  var K_LEAD = 340, C_LEAD = 25;
  var K_DRAG = 205, C_DRAG = 21;

  /* The ghost is *not* a third spring, which is what it was first written as
     and why it looked wrong. A damped spring chasing a fast-moving target
     settles at a lag of c·v/k, and across the widest hop in this bar the body
     peaks near 2000px/s — so a spring slack enough to visibly trail sat 270px
     behind, pinned against its own clamp for thirty straight frames. Stiffen
     it to lag ~25px instead and ω·dt passes 2, where explicit Euler stops
     integrating and starts exploding.

     A trail is not an object being pulled along; it is *where the body was a
     moment ago*. So it is defined that way: lag is the current velocity times
     a fixed slice of time, low-passed so it cannot jitter. It scales with
     speed for free, and it returns to zero exactly when the motion does. */
  var TRAIL_LAG = 0.013;

  /* Vertical squash at full speed, and the horizontal speed that counts as
     full. 14% is about the most that still reads as the same object
     deforming rather than a different, flatter one. */
  var SQUASH = 0.14;
  var SPEED_REF = 2600;

  /* Squash is a spring too, not a low-pass. A low-pass can only ease back to
     round, and easing back to round is what a firm object does; jelly
     overshoots and rebounds past it. Deliberately the softest spring in the
     file — ζ≈0.5, so it crosses zero and stands *taller* than its target for
     a moment on arrival before settling. That single rebound is most of the
     difference between "springy" and "jelly". */
  var K_SQ = 150, C_SQ = 9.5;
  /* How far past round the rebound may go, as a share of SQUASH. */
  var SQ_MIN = -0.65;

  /* ---- Goo ---------------------------------------------------------------
     Three elements make the metaball: the body, a tail left behind at the
     origin, and a neck spanning them. Under the filter they are one mass —
     the neck pinches out first, then the orphaned tail shrinks and is gone.

     Both cutoffs are expressed against flight progress rather than time, so a
     short hop between neighbours and a long one across the bar pinch at the
     same point in the *journey* instead of the same number of milliseconds.
     The neck goes first, which is what leaves a detached blob behind to
     collapse on its own — that ordering is the whole effect.

     Measured on the way in: at 0.45 and 0.72 the whole thing was over in 150
     milliseconds. The body springs away so hard that a fifth of the journey
     is gone in three frames, so cutoffs that sound generous as fractions are
     nothing at all as time. The tail now runs the full length of the flight
     and the neck holds most of the way. */
  var NECK_END = 0.6;
  var TAIL_END = 1;
  /* The neck is thinner than the blobs it joins, so the filter's threshold
     eats it before it eats them. That is what makes it *pinch* rather than
     fade. */
  var NECK_THICK = 0.58;
  /* The body blob is deliberately *smaller* than the pill it sits under, not
     the same size. At full size the white mass reached the pill's own rim and
     washed it out — and because the pill's lens samples whatever is behind
     it, a solid white backdrop is also the one thing that leaves the
     refraction nothing to bend. Kept to a core inside the capsule, it anchors
     the neck at mid-height and leaves the top and bottom hairlines sitting
     over clear backdrop, where they still read as glass. */
  var BODY_CORE = 0.72;
  /* Base box of a blob in CSS, mirrored from nav-morph.css. Everything is
     scaled off this, and the radius distortion that would matter on the pill
     does not matter at all here — these are round masses behind a blur. */
  var BLOB = 48;

  /* The ghost's ceiling: how far it may lag before it stops growing, and how
     solid it gets at full lag. Both live here rather than as CSS custom
     properties because nothing in the stylesheet reads them — the two values
     the stylesheet does read, --nm-trail-x and --nm-trail-a, are written per
     frame from these. Set a little
     above the lag the fastest hop in the bar actually produces, so the ghost
     spends the flight tracking the speed rather than pinned at full strength
     against its own ceiling — which is not a trail, it is a second pill. */
  var TRAIL_MAX = 30;
  var TRAIL_PEAK = 0.5;

  /* How long a click owns the destination. The spy fires a handful of times
     while the smooth scroll crosses the sections in between, and without this
     the pill would visit every one of them on the way. */
  var CLICK_LOCK_MS = 1100;

  /* How long a leave waits to see whether the pointer has simply moved to the
     next item. Long enough to bridge the mouseleave/mouseenter pair reliably,
     short enough that leaving the bar for real still reads as immediate. */
  var HOVER_GRACE = 70;

  /* ---- The pill ----------------------------------------------------------
     Appended last so it is a sibling of the list items, and marked
     aria-hidden: the current section is already announced by the aria-current
     script.js puts on the anchor itself. This is decoration for that fact. */
  /* ---- The goo -----------------------------------------------------------
     The thing an SVG filter and a backdrop-filter cannot both do on one
     element, done on two. The lens has to stay on the pill — it is the only
     part of this that is really glass — so the metaball goes on a layer of
     its own *behind* it, carrying no backdrop-filter at all and therefore no
     conflict. The pill supplies the glass; this supplies the liquid the glass
     is travelling through.

     What it costs, and why it is gated: a filtered layer repaints on every
     frame it changes. So it carries the filter only while something is
     actually in flight (the is-live class), and is skipped outright wherever
     motion or transparency has been turned down. At rest it is an empty
     element with no filter and no opacity, and the capsule is exactly the
     capsule it was without it.

     Skipped too if the engine cannot do url() filters, in which case the pill
     travels alone and everything else still works. */
  var goo = null, blobBody = null, blobNeck = null, blobTail = null;

  var wantGoo =
    !reduceMotion &&
    !(mq && mq('(prefers-reduced-transparency: reduce)').matches) &&
    (!window.CSS || !CSS.supports || CSS.supports('filter', 'url(#a)'));

  if (wantGoo) {
    /* The filter itself. Blur to make the shapes bleed into one another, then
       crank the alpha channel hard so the bleed resolves to a single hard
       edge — where two blurs overlap the sum clears the threshold and the
       surface joins; where they thin out it does not, and the surface parts.
       That threshold crossing *is* the pinch.

       The blur radius and the threshold are one setting, not two, and they
       have to be calibrated against the size of the smallest blob rather than
       chosen for how gooey they sound. At stdDeviation 9 against a 29px tail
       the blur spread the mass so thin that its own peak alpha fell *below*
       the cutoff, and the crank — which cannot tell a faint blob from a faint
       edge — erased the whole thing. Measured: tail and neck rendered nothing
       at all, only the body survived. 6 against a threshold of 0.35 leaves
       every blob in the layer comfortably above the line while still merging
       them across a gap.

       For the same reason the fill is opaque white and is not a brightness
       control — see nav-morph.css. How strong the liquid reads is the layer's
       opacity, applied after all of this.

       sRGB rather than the default linearRGB, for the same reason glass.js
       says so: the default shifts what the numbers mean.

       The region is generous on every side because the blur reaches past the
       blobs, and the default -10%/120% box would slice the mass off flat. */
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML =
      '<defs><filter id="nm-goo" color-interpolation-filters="sRGB"' +
      ' x="-25%" y="-75%" width="150%" height="250%">' +
      '<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b"/>' +
      '<feColorMatrix in="b" type="matrix" values="' +
      '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -7"/>' +
      '</filter></defs>';
    document.body.appendChild(svg);

    goo = document.createElement('div');
    goo.className = 'nav-morph-goo';
    goo.setAttribute('aria-hidden', 'true');
    blobTail = document.createElement('div');
    blobNeck = document.createElement('div');
    blobBody = document.createElement('div');
    blobTail.className = blobNeck.className = blobBody.className = 'nav-morph-blob';
    goo.appendChild(blobTail);
    goo.appendChild(blobNeck);
    goo.appendChild(blobBody);
    list.appendChild(goo);
  }

  /* Appended after the goo, so the glass paints over the liquid. */
  var pill = document.createElement('div');
  pill.className = 'nav-morph-pill';
  pill.setAttribute('aria-hidden', 'true');
  list.appendChild(pill);
  /* Set before the first measurement, never after: the stylesheet makes the
     list the pill's containing block off this attribute, and the rects below
     are differenced against that same box. */
  list.setAttribute('data-nav-morph', '');

  /* ---- Geometry ----------------------------------------------------------
     Measured up front and re-measured only when the layout can actually have
     moved, never per frame. These are layout-forcing reads; script.js's
     scroll spy caches its section offsets for exactly this reason and says
     so, and a travelling indicator is on screen during the same scrolls.

     Rects rather than offsetLeft, and not as a matter of taste. The
     stylesheet has to position each <li> so the labels stack above the pill,
     and a positioned <li> becomes its own anchor's offsetParent — so
     a.offsetLeft resolves against the item that wraps it and is 0 for every
     link in the bar. Measured on the way in: all seven read offsetLeft=0,
     offsetTop=0, and the pill parked on top of the logo. Rects are measured
     against the viewport and differenced here, so nothing in the middle of
     the tree can change what they mean. They are also fractional, which
     offsetLeft is not — the capsule lands on the same subpixel as its label
     rather than up to half a pixel off it. */
  var rects = [];

  function measure() {
    var base = list.getBoundingClientRect();
    for (var i = 0; i < links.length; i++) {
      var r = links[i].getBoundingClientRect();
      rects[i] = {
        l: r.left - base.left,
        t: r.top - base.top,
        w: r.width,
        h: r.height
      };
    }
  }

  function indexOf(a) {
    for (var i = 0; i < links.length; i++) {
      if (links[i] === a) return i;
    }
    return -1;
  }

  measure();

  /* ---- State -------------------------------------------------------------
     l/r are the live edges in list coordinates, vl/vr their velocities. sq is
     the current squash, 0..1. tc/tv are the trailing ghost's own position and
     velocity. tc is the current lag in pixels, signed against the direction
     of travel. dir is the direction of the flight in progress, fixed at
     retarget rather than recomputed per frame — deciding the leader from the
     current sign would swap the two stiffnesses the instant the pill overshot,
     which is a discontinuity right where the motion should be settling. */
  var st = {
    l: 0, r: 0, vl: 0, vr: 0,
    sq: 0, vsq: 0,
    tc: 0, dir: 0,
    /* Centres the current flight started and is aimed at, so the goo can ask
       how far along it is. Equal means there is no flight — a pop, or at
       rest — and the tail and neck stay out of it. */
    o0: 0, o1: 0
  };
  var shown = false;
  var targetIdx = -1;

  var activeLink = null;
  var hoverLink = null;
  var lockLink = null;
  var lockUntil = 0;

  var raf = 0;
  var lastT = 0;

  /* ---- Writing a frame ---------------------------------------------------
     The box is already at the target; this is only ever the inverse. With
     transform-origin at 0 0 the arithmetic is direct — no half-width term,
     which is the whole reason the origin is pinned there in the stylesheet. */
  function write() {
    var t = rects[targetIdx];
    if (!t || !t.w || !t.h) return;

    var w = st.r - st.l;
    var sx = w / t.w;
    var h = t.h * (1 - st.sq * SQUASH);
    var sy = h / t.h;
    /* Squash from the middle: a capsule that thinned towards its top edge
       would read as being pressed against the bar rather than as deforming. */
    var top = t.t + (t.h - h) / 2;

    pill.style.transform =
      'translate(' + (st.l - t.l).toFixed(2) + 'px,' + (top - t.t).toFixed(2) +
      'px) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';

    var lag = st.tc;
    if (lag > TRAIL_MAX) lag = TRAIL_MAX;
    else if (lag < -TRAIL_MAX) lag = -TRAIL_MAX;

    /* The ghost is a child of a horizontally scaled box, so its own translate
       is scaled along with it. Dividing it back out keeps the lag the same
       number of screen pixels whatever the pill is doing. */
    pill.style.setProperty('--nm-trail-x', (lag / (sx || 1)).toFixed(2) + 'px');
    pill.style.setProperty(
      '--nm-trail-a',
      (Math.min(1, Math.abs(lag) / TRAIL_MAX) * TRAIL_PEAK).toFixed(3)
    );

    if (goo) drawGoo(st.l, top, w, h);
  }

  /* Lay one blob into the layer. Everything is a scale off the same square
     base box, so a blob is a capsule, a circle or a bar depending only on
     what it is handed — and the radius distortion that would be wrong on the
     pill is invisible here, behind nine pixels of blur. */
  function blob(el, x, y, w, h) {
    el.style.transform =
      'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) scale(' +
      (w / BLOB).toFixed(4) + ',' + (h / BLOB).toFixed(4) + ')';
  }

  function drawGoo(x, y, w, h) {
    var c = x + w / 2;
    var span = st.o1 - st.o0;

    /* A pop has no origin to leave anything behind at, so it is body only. */
    var p = span ? (c - st.o0) / span : 1;
    if (p < 0) p = 0;
    else if (p > 1) p = 1;

    var bh = h * BODY_CORE;
    /* Inset by the same amount on every side, so the core is a capsule
       concentric with the pill. Floored at a circle: early in a pop the pill
       is narrower than its own height, and an unclamped inset would take the
       width negative and flip the blob inside out. */
    var bw = w - (h - bh);
    if (bw < bh) bw = bh;
    blob(blobBody, x + (w - bw) / 2, y + (h - bh) / 2, bw, bh);

    var tailK = 1 - p / TAIL_END;
    var neckK = 1 - p / NECK_END;
    if (tailK < 0) tailK = 0;
    if (neckK < 0) neckK = 0;

    /* The tail holds its ground at the origin and collapses in place. */
    var th = bh * tailK;
    var tw = bh * tailK;
    blob(blobTail, st.o0 - tw / 2, y + (h - th) / 2, tw, th);

    /* The neck spans centre to centre and thins as they part. It is never
       toggled out of the layer — a blob that disappears pops, and the point
       of the filter is that it *pinches*: the bar thins until the alpha
       threshold stops finding enough of it and the surface parts on its own.
       Once that has happened it is folded away to nothing, because a
       zero-height bar four hundred pixels long is still a box the filter
       region has to cover. */
    var nh = bh * neckK * NECK_THICK;
    var n0 = neckK ? Math.min(st.o0, c) : c;
    var nw = neckK ? Math.abs(c - st.o0) : 0;
    blob(blobNeck, n0, y + (h - nh) / 2, nw, nh);

    /* The layer fades on the strongest thing in it, so it is out of the way
       the moment the mass is one object again. */
    var a = Math.max(tailK, neckK);
    goo.style.setProperty('--nm-goo-a', a.toFixed(3));
    goo.classList.toggle('is-live', a > 0.001);
  }

  /* Park the box on a target. Layout for one absolutely positioned element,
     paid once per retarget — and it is also what tells the lens to rebuild:
     glass.js keeps a debounced ResizeObserver on whatever it is attached to,
     so the displacement map is regenerated at the new width once the flight
     is under way rather than on every frame of it. */
  function park(i) {
    var t = rects[i];
    pill.style.left = t.l + 'px';
    pill.style.top = t.t + 'px';
    pill.style.width = t.w + 'px';
    pill.style.height = t.h + 'px';
    targetIdx = i;
  }

  function settle() {
    var t = rects[targetIdx];
    st.l = t.l;
    st.r = t.l + t.w;
    st.vl = st.vr = 0;
    st.sq = 0;
    st.vsq = 0;
    st.tc = 0;
    /* No flight left, so the goo has nothing to be the two ends of. */
    st.o0 = st.o1 = t.l + t.w / 2;
    write();
  }

  function frame(now) {
    raf = 0;
    var dt = lastT ? (now - lastT) / 1000 : 1 / 60;
    lastT = now;
    /* A backgrounded tab hands back one enormous dt on return, and a spring
       integrated over 4 seconds in a single step explodes. */
    if (dt > 1 / 30) dt = 1 / 30;

    var t = rects[targetIdx];
    /* Returning bare here would abandon the loop with `shown` still true and
       the pill parked mid-flight — and update() below will not restart it,
       because the target it would ask for is the one already in targetIdx.
       There is no path back from that: the capsule stays stranded until
       something changes the destination. Hand it to the recovery in
       update() instead of dropping it on the floor. */
    if (!t || !t.w || !t.h) return;

    var tl = t.l;
    var tr = t.l + t.w;

    /* dir 0 is the pop — no direction of travel, so both edges get the stiff
       spring and the capsule expands evenly out of its own centre. */
    var kL = st.dir > 0 ? K_DRAG : K_LEAD;
    var cL = st.dir > 0 ? C_DRAG : C_LEAD;
    var kR = st.dir < 0 ? K_DRAG : K_LEAD;
    var cR = st.dir < 0 ? C_DRAG : C_LEAD;

    st.vl += (-kL * (st.l - tl) - cL * st.vl) * dt;
    st.l += st.vl * dt;
    st.vr += (-kR * (st.r - tr) - cR * st.vr) * dt;
    st.r += st.vr * dt;

    /* Squash chases the speed of the body on a spring of its own, so it
       arrives at round with velocity left over and carries on through into a
       rebound — the capsule stands taller than its target for a beat and
       settles back. Clamped below so the rebound is a wobble and not a
       balloon. */
    var vc = (st.vl + st.vr) / 2;
    var sqWant = Math.min(1, Math.abs(vc) / SPEED_REF);
    st.vsq += (-K_SQ * (st.sq - sqWant) - C_SQ * st.vsq) * dt;
    st.sq += st.vsq * dt;
    if (st.sq < SQ_MIN) { st.sq = SQ_MIN; st.vsq = 0; }
    else if (st.sq > 1) { st.sq = 1; st.vsq = 0; }

    /* Where the body was TRAIL_LAG seconds ago, low-passed. */
    st.tc += (-vc * TRAIL_LAG - st.tc) * Math.min(1, dt * 22);

    write();

    /* Loose on purpose. Tighter thresholds kept the loop alive for another
       fifteen frames of motion smaller than a pixel — real compositing work,
       against a live backdrop, for nothing anybody can see. Landing is done
       by settle() writing the exact target anyway, so the only thing a tight
       threshold buys is a longer tail. */
    var atRest =
      Math.abs(st.l - tl) < 0.2 && Math.abs(st.r - tr) < 0.2 &&
      Math.abs(st.vl) < 4 && Math.abs(st.vr) < 4 &&
      Math.abs(st.sq) < 0.006 && Math.abs(st.vsq) < 0.08 &&
      Math.abs(st.tc) < 0.5;

    if (atRest) {
      /* Land exactly, so the pill's resting hairline is on the same subpixel
         as the label it frames. */
      settle();
      st.dir = 0;
      return;
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || reduceMotion) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---- Targeting ---------------------------------------------------------
     Hover outranks everything: it is the only one of the three that is a
     direct statement of intent. A click owns the destination for as long as
     the smooth scroll takes, and the spy owns it the rest of the time. */
  function want() {
    if (hoverLink) return hoverLink;
    if (lockLink && Date.now() < lockUntil) return lockLink;
    return activeLink;
  }

  function popTo(i) {
    park(i);
    var t = rects[i];
    var c = t.l + t.w / 2;
    /* Out of a third of its width, evenly, with the stiff spring on both
       edges — so it arrives past full size and comes back. That overshoot is
       the pop; starting at full size would only be a fade. */
    var half = t.w * 0.16;
    st.l = c - half;
    st.r = c + half;
    st.vl = st.vr = 0;
    /* Born flat as well as narrow. Without this the height is constant
       through the whole pop — the edges move symmetrically, so the speed term
       that drives squash is ~0 — and a capsule that only widens reads as a
       curtain opening rather than a bubble inflating. This decays on the same
       low-pass as any other squash, so it rounds out as it fills. */
    st.sq = 0.55;
    st.vsq = 0;
    st.tc = 0;
    st.dir = 0;
    st.o0 = st.o1 = c;
    if (reduceMotion) settle();
    else write();
    pill.classList.add('is-on');
    shown = true;
    start();
  }

  function flyTo(i) {
    var t = rects[i];
    var from = (st.l + st.r) / 2;
    var to = t.l + t.w / 2;
    st.dir = to > from ? 1 : to < from ? -1 : 0;
    /* Where the mass is tearing away from, and where it is heading. The goo
       measures progress between these two rather than against the clock, so a
       hop between neighbours and a hop across the whole bar pinch at the same
       point in the journey. Taken from the live centre, not the previous
       target — a retarget mid-flight tears away from wherever the pill has
       actually got to. */
    st.o0 = from;
    st.o1 = to;
    park(i);
    if (reduceMotion) settle();
    else {
      /* Same turn as park(), so the box move and the inverse that cancels it
         reach the compositor together and the pill never shows a frame at the
         destination it has not travelled to yet. */
      write();
      start();
    }
  }

  function hide() {
    if (!shown) return;
    pill.classList.remove('is-on');
    if (goo) {
      goo.classList.remove('is-live');
      goo.style.setProperty('--nm-goo-a', '0');
    }
    shown = false;
    /* The spring is deliberately *not* stopped here.

       `stop()` used to cancel it wherever it had got to, and the fade this
       triggers is 0.16s long — so a hide that interrupted a flight left a
       stretched capsule sitting in the gap between two labels, detached from
       anything, dissolving in mid-air. That is the ghost: scroll up off the
       first section, the spy drops .is-active while the pill is still
       crossing the bar, and what fades out is a capsule pointing at nothing.
       Measured on the way in, scrolling to the top of the hero: the pill was
       left at scale(1.2171, 0.9669), 22.1px from the nearest link box, and
       it stayed there — long after it was invisible, so that was also the
       shape anything reading the element next would find.

       Snapping it onto the target instead would fix the leftover geometry but
       trade the ghost for a jump. Letting the flight finish costs the tail of
       one spring against an element that is already fading, and it is what a
       real object does: it carries on to where it was going while the light
       goes out of it. frame() lands and stops itself a few frames later. */
  }

  function update() {
    var el = want();
    if (!el) {
      hide();
      return;
    }

    var i = indexOf(el);
    if (i < 0) {
      hide();
      return;
    }

    pill.classList.toggle('is-hover', !!hoverLink);

    if (!shown) popTo(i);
    else if (i !== targetIdx) flyTo(i);
    else resume();
  }

  /* The target has not changed, so neither popTo nor flyTo will run — but
     that is exactly the case where a pill left stranded by a dropped frame
     has no way home. Anything that ends the spring without landing it (a
     frame that returned early, a loop cancelled between a park and its
     write) leaves the geometry wrong and the destination right, and every
     later update() reads `i === targetIdx` and does nothing.

     So check the invariant rather than trusting it: if the live edges are not
     on the target's edges, the pill is not where it claims to be, and the
     spring gets started again to carry it the rest of the way. At rest the
     comparison is exact — settle() writes st.l and st.r straight off the same
     rect — so this costs two subtractions on the overwhelmingly common path
     and starts nothing. */
  function resume() {
    if (raf || reduceMotion) return;
    var t = rects[targetIdx];
    if (!t || !t.w || !t.h) return;
    if (Math.abs(st.l - t.l) < 0.2 && Math.abs(st.r - (t.l + t.w)) < 0.2) return;
    start();
  }

  /* ---- Input -------------------------------------------------------------
     focus is listened for alongside hover so the pill follows a keyboard
     walk through the bar, which is the whole point of having one indicator:
     wherever the bar's attention is, that is where the capsule is.

     A leave is *deferred*, and that is the whole fix for the thing this file
     got wrong first time round. In a row of capsules a mouseleave is nearly
     always followed within a frame or two by a mouseenter on the neighbour —
     the DOM fires them in that order — so acting on the leave immediately
     asks a question the pointer is about to answer. What that produced:

       on the hero, where no section is current yet, sliding from About to
       Education ran hide() on the leave — capsule faded out, spring cancelled
       — and then popped a fresh one at Education. Two static states instead
       of a journey, which is exactly the report: no animation when hovering
       the tabs at the top of the page.

       further down, with a section current, the leave launched a flight back
       toward that section which the next enter reversed a few frames later —
       a visible backwards jerk before the pill went where it was going.

     Waiting a beat collapses both into one continuous flight. The window only
     has to outlast the gap between the two events, so it is short enough that
     a real exit still feels immediate. */
  var leaveTimer = null;

  function cancelLeave() {
    if (leaveTimer === null) return;
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }

  function enter(a) {
    cancelLeave();
    hoverLink = a;
    update();
  }

  function leave(a) {
    if (hoverLink !== a) return;
    cancelLeave();
    leaveTimer = setTimeout(function () {
      leaveTimer = null;
      hoverLink = null;
      update();
    }, HOVER_GRACE);
  }

  Array.prototype.forEach.call(links, function (a) {
    a.addEventListener('mouseenter', function () { enter(a); });
    a.addEventListener('mouseleave', function () { leave(a); });
    a.addEventListener('focus', function () { enter(a); });
    a.addEventListener('blur', function () { leave(a); });

    a.addEventListener('click', function () {
      cancelLeave();
      lockLink = a;
      lockUntil = Date.now() + CLICK_LOCK_MS;
      /* The press. Squash it flat and shove both edges outward, then let the
         springs pull it back — the capsule answers the click itself rather
         than only reporting where the click is taking you. Skipped under
         Reduce Motion along with everything else that moves. */
      if (!reduceMotion && shown) {
        st.sq = 0.9;
        st.vl -= 90;
        st.vr += 90;
        start();
      }
      update();
    });
  });

  /* The spy owns .is-active and writes it from a scroll handler, so it is
     watched rather than listened for — the same arrangement nav-glass.js
     uses, and it keeps script.js free of any knowledge of this file. */
  function syncActive() {
    var next = list.querySelector('a.is-active');
    if (next === activeLink) return;
    activeLink = next;
    /* The scroll has arrived where the click was headed; hand the destination
       back to the spy so a later scroll away is followed immediately. */
    if (lockLink && activeLink === lockLink) lockLink = null;
    update();
  }

  var mo = new MutationObserver(syncActive);
  Array.prototype.forEach.call(links, function (a) {
    mo.observe(a, { attributes: true, attributeFilter: ['class'] });
  });

  /* ---- Re-measure --------------------------------------------------------
     Anything that can change a link's box: a resize, the late webfont (Inter
     is loaded off the critical path, and the fallback metrics are not its
     metrics), and images finishing. Each one re-measures and puts the pill
     back on its target without animating — a capsule springing across the bar
     because the window was dragged is motion nobody asked for. */
  function remeasure() {
    measure();
    if (shown && targetIdx >= 0) {
      park(targetIdx);
      stop();
      settle();
    }
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(remeasure, 120);
  }, { passive: true });

  window.addEventListener('load', remeasure);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(remeasure);
  }

  /* The spy may already have marked a section before this file ran. */
  syncActive();
})();
