/* ==========================================================================
   Dial tick — a detent click as each value passes under the picker's band
   ==========================================================================

   Self-contained and removable: see REMOVE-DIAL-TICK.md. Nothing in
   meeting-picker.js or meeting-picker.css was touched to add this, and
   nothing there knows this file exists. All it does is read scrollTop off
   the six .mp-wheel columns and synthesise a click when the value under the
   band changes.

   The sound is generated, not loaded: a tick is two oscillator-shaped
   nodes and a noise burst, which is far less to ship than the smallest
   usable audio file and never costs a request.

   Silence is the default. Audio only ever plays after a deliberate gesture
   inside the picker — the AudioContext is not even constructed before then,
   partly because browsers refuse to start one without a gesture, and partly
   because a portfolio site that makes noise at someone on page load is a
   bug no matter what the spec allows.
   ========================================================================== */

(function () {
  'use strict';

  /* ---- Configuration ---------------------------------------------------- */

  /* The one knob worth turning: a plain multiplier over both halves of the
     tick. Not capped at 1 — the two envelopes below peak at 0.18 and 0.07,
     so the real ceiling is a shade under 4, where their sum reaches full
     scale and the destination starts hard-clipping. Tuned by ear; this is a
     foreground sound here rather than a subliminal one.

     Gain is a blunt lever past about here, though. The tick is 25ms long,
     and beyond a point more of it reads as sharper rather than louder —
     eventually just harsh. For more presence, lengthen the decays in play()
     or lift the thump relative to the burst: a longer, bassier tick sounds
     louder than a brighter one at the same gain. */
  var VOLUME = 1.28;

  /* Floor between two ticks. A hard fling crosses far more values per second
     than this allows, and the extras are dropped rather than played: past
     roughly 35 per second a run of clicks stops reading as separate events
     and starts reading as a tone. */
  var MIN_GAP_MS = 28;

  /* Gaps at or below FAST_MS are a fling, at or above SLOW_MS a deliberate
     drag. Strength is interpolated between the two, so speeding up fades the
     ticks back instead of turning them into a machine gun. */
  var FAST_MS = 30;
  var SLOW_MS = 120;
  var FAST_STRENGTH = 0.35;

  /* ---- Bail-outs -------------------------------------------------------- */

  var root = document.querySelector('.mp');
  if (!root) return;

  var columns = root.querySelectorAll('.mp-wheel');
  if (!columns.length) return;

  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  /* Reduced motion is about movement rather than sound, but someone who has
     asked the system to stop animating things is not asking for an extra
     sensory channel either. Treated as a request for a quieter interface. */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ---- Audio ------------------------------------------------------------ */

  var ctx = null;
  var noiseBuf = null;
  var lastTickAt = 0;

  /* Constructed on the first gesture and resumed on every one after it: iOS
     suspends the context when the tab goes to the background, and the only
     thing allowed to wake it is a user gesture, so every gesture retries. */
  function ensureContext() {
    if (!ctx) {
      try {
        ctx = new AudioCtx();
      } catch (e) {
        return null;                /* audio blocked outright; stay silent */
      }
      /* 40ms of white noise, made once and replayed by every tick. Each
         BufferSource is single-use, but the samples behind them are not. */
      var n = Math.floor(ctx.sampleRate * 0.04);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* One detent passing its spring, in two parts: a filtered noise burst for
     the transient — the part that actually reads as "click" — and a short
     low sine under it for body, without which the tick sounds like a fault
     in the speaker rather than a mechanism.

     `strength` is 0..1 from the scroll speed and scales both. */
  function play(strength) {
    var t = ctx.currentTime;

    /* Per-tick jitter. Identical ticks played in a fast run sound sampled;
       a few percent of drift in pitch is enough to sound mechanical. */
    var wobble = 0.92 + Math.random() * 0.16;

    /* The transient. Bandpass rather than the raw burst: unfiltered white
       noise is a "shh", and the click lives in a narrow band around 2kHz.
       Faster ticks are filtered brighter as well as quieter, which is what
       a real dial does when it is spun instead of nudged. */
    var burst = ctx.createBufferSource();
    burst.buffer = noiseBuf;

    var band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = (2200 + (1 - strength) * 700) * wobble;
    band.Q.value = 1.2;

    var burstGain = ctx.createGain();
    var burstPeak = 0.18 * VOLUME * strength;
    /* exponentialRamp cannot touch zero from either end, so the envelope
       runs between near-silence values and the node is stopped after. */
    burstGain.gain.setValueAtTime(0.0001, t);
    burstGain.gain.exponentialRampToValueAtTime(burstPeak, t + 0.001);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

    burst.connect(band);
    band.connect(burstGain);
    burstGain.connect(ctx.destination);
    burst.start(t);
    burst.stop(t + 0.04);

    /* The body. Quiet enough to be felt rather than heard as a pitch. */
    var thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.value = 180 * wobble;

    var thumpGain = ctx.createGain();
    var thumpPeak = 0.07 * VOLUME * strength;
    thumpGain.gain.setValueAtTime(0.0001, t);
    thumpGain.gain.exponentialRampToValueAtTime(thumpPeak, t + 0.002);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);

    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thump.start(t);
    thump.stop(t + 0.04);
  }

  /* A value just crossed the band somewhere. Decides whether this one is
     allowed to make a sound, and how much of one. */
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    if (document.hidden) return;

    var now = performance.now();
    var gap = now - lastTickAt;
    if (gap < MIN_GAP_MS) return;
    lastTickAt = now;

    var span = SLOW_MS - FAST_MS;
    var ratio = Math.max(0, Math.min(1, (gap - FAST_MS) / span));
    play(FAST_STRENGTH + (1 - FAST_STRENGTH) * ratio);
  }

  /* ---- Arming ----------------------------------------------------------- */

  /* Nothing above is reachable until a gesture lands inside the picker —
     which covers the wheels, the Book-a-slot toggle, and the form. Opening
     the panel is itself a gesture, so the context is usually awake by the
     time the first column is touched.

     This is also what keeps the six select() calls that position the wheels
     on page load silent: they scroll, but there is no context to hear it. */
  root.addEventListener('pointerdown', ensureContext, { passive: true });
  root.addEventListener('keydown', ensureContext);

  /* ---- Watching the columns --------------------------------------------- */

  /* Item height is a CSS custom property and changes at a breakpoint, so it
     is measured rather than assumed, cached, and dropped on resize. */
  var itemH = 0;
  window.addEventListener('resize', function () { itemH = 0; }, { passive: true });

  function measure() {
    if (!itemH) {
      var item = root.querySelector('.mp-item');
      if (item) itemH = item.offsetHeight;
    }
    return itemH;
  }

  Array.prototype.forEach.call(columns, function (el) {
    var last = null;
    var pending = false;

    /* Coalesced to one read per frame. Crossing several values inside a
       single frame is a fling, and MIN_GAP_MS would have thrown the extra
       ticks away regardless. */
    function read() {
      pending = false;
      var h = measure();
      if (!h) return;

      var at = Math.round(el.scrollTop / h);
      if (last === null) {            /* first sighting: seed, do not tick */
        last = at;
        return;
      }
      if (at !== last) {
        last = at;
        tick();
      }
    }

    el.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(read);
    }, { passive: true });
  });
})();
