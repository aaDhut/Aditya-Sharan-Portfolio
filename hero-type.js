/* [hero-type] Removable feature.

   Types the hero headline and tagline in on arrival, flashes each character as
   it lands, sweeps a shimmer across the headline once it is whole, and throws
   a short burst of emoji at two named phrases in the tagline.

   The script owns the whole effect: it finds its own elements, rewrites their
   text into per-character spans, and injects its own effects layer. index.html
   is untouched apart from the two tags that load this file and hero-type.css,
   so deleting those three files removes the feature completely and the hero
   falls back to the plain text styles.css already renders.

   See REMOVE-HERO-TYPE.md. */
(function () {
  'use strict';

  /* ---- What gets typed, and what interrupts it ------------------------- */

  /* The two lines, in the order they type. `title` gets the resting glow and
     the shimmer sweep; `tag` gets neither, because a halo on 1.2rem body copy
     reads as a rendering fault rather than as atmosphere.

     Selectors, not markup hooks: nothing in index.html knows this file
     exists. */
  var LINES = [
    { selector: '.hero h1', kind: 'title' },
    { selector: '.hero-tagline', kind: 'tag' }
  ];

  /* The parts of the hero that do not type but still belong to the sequence,
     and where each one enters.

     `at` is a stage in the timeline rather than a number, because the numbers
     move whenever the pacing constants do and a hand-tuned delay would quietly
     drift out of step with them:

       'open' — before the headline, opening the sequence.
       'tag'  — as the tagline starts, which is also where the headline's
                shimmer begins.

     The button row deliberately enters at 'tag' rather than at the end. It is
     the only interactive thing in the hero, and holding it back until the last
     character lands would leave the one control on the page absent for over
     five seconds — a sequence that looks composed is not worth a hero you
     cannot use while it plays. */
  var SUPPORTING = [
    { selector: '.hero .eyebrow', at: 'open' },
    { selector: '.hero-actions', at: 'tag' }
  ];

  /* The moments in the copy worth punctuating, matched on words rather than on
     raw substrings so that punctuation attached to a word ("ship:", "management.")
     does not break the match. Each burst fires when the last character of its
     last word lands, and the emoji are spread across the phrase they belong to.

     Add or change a line here and nothing else needs to move; a phrase that
     does not appear in the copy is skipped in silence. */
  var BURSTS = [
    { phrase: 'concept', emojis: ['🎨', '🖌️'] },
    { phrase: 'AI product management', emojis: ['📦', '💼', '🤝'] }
  ];

  /* ---- Pacing ---------------------------------------------------------- */

  /* How long to wait after the fonts settle before the first character. Short
     enough that the hero is never just empty, long enough that the typing
     reads as something that starts rather than something already in progress
     when you arrive. */
  var START_DELAY = 320;

  /* Milliseconds per character, per line. The headline is 19 characters and
     the tagline is 88, so a single shared rate would either rush the headline
     or make the tagline a chore — the headline is the thing being read, the
     tagline is a long sentence nobody wants delivered one letter at a time at
     headline pace.

     These land the headline in about 1.8s and the tagline in about 4.0s, so
     the last character arrives around 6.6s and its flash finishes near 7.5s.
     That is a long hero, and it is long deliberately — but it is the first
     number to pull back if the sequence ever needs shortening.

     Both have been raised twice now. 42/17 was far too quick to read at all;
     75/34 still went by faster than the eye tracks, which reads as the text
     simply appearing rather than as being typed. The tagline feels the rate
     far more than the headline does — it is 88 characters against 19 — which
     is why the gap between the two values is wider than it looks like it
     should be. */
  var TITLE_MS = 100;
  var TAG_MS = 46;

  /* The pause between the two lines. Long enough to be a beat, short enough
     that it is not a stall. */
  var GAP = 420;

  /* Must match the ht-spark duration in hero-type.css. A line is only marked
     done — which drops every per-character animation — once its last character
     has finished flashing, otherwise the final letter's flash is cut off
     mid-way.

     Long enough that the flash is a thing you watch decay rather than a
     single frame you half-catch. At 520 it was over before it registered. */
  var SPARK_MS = 900;

  /* How long the headline's shimmer runs, matching ht-sweep in the CSS.

     Note this is the duration of the whole travel, and the band spends the
     first and last quarter of it off the edges of the headline where nothing
     is visible — so the part anyone actually watches is roughly half of this.
     Read it as "about three seconds of visible sweep", not six. */
  var SWEEP_MS = 6000;

  /* One emoji's flight, and the stagger between them.

     Slow enough to actually be looked at. These are the one part of the effect
     that is purely decorative, so if they pass too quickly to identify there
     was no point drawing them at all — and at 1300/130 the three product-line
     emoji went by as an indistinct flicker.

     The stagger is what makes a burst read as a handful of things thrown
     rather than one thing that happens to have three parts; widening it also
     spreads the burst over enough time to take in each glyph separately. */
  var EMOJI_MS = 2400;
  var EMOJI_STAGGER = 260;

  /* How far an emoji drifts sideways, and how far it rises.

     The fan is wider than the climb on purpose. The tagline sits directly
     under the headline, so an emoji thrown mostly upward from a word in it
     travels straight through "Hi, I'm Aditya Sharan." at full opacity — which
     read as clutter over the one line the hero most wants you to look at.
     Arcing them outward instead keeps the flight in the empty space beside
     the copy.

     The drift is still capped: .hero sets overflow-x: clip, so anything thrown
     much wider than this is sliced off at the section edge rather than flying
     free. */
  var EMOJI_DRIFT = 54;
  var EMOJI_RISE = 34;

  /* ---- Guards ---------------------------------------------------------- */

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function start() {
    var hero = document.querySelector('.hero');
    if (!hero) return;

    /* Collect the lines first. If either is missing the copy has been rewritten
       and the phrase config is probably stale too, so do nothing at all rather
       than half of it. */
    var lines = [];
    for (var i = 0; i < LINES.length; i++) {
      var el = document.querySelector(LINES[i].selector);
      if (!el) return;
      lines.push({ el: el, kind: LINES[i].kind, ms: LINES[i].kind === 'title' ? TITLE_MS : TAG_MS });
    }

    for (var j = 0; j < lines.length; j++) {
      split(lines[j]);
    }

    /* Held hidden from here, not from when the sequence actually starts. The
       gap between the two is only a frame or so, but setting it at the same
       moment the text is split means these never paint at full strength and
       then blink out to enter — they are simply not there yet, exactly like
       the untyped characters beside them.

       Missing elements are skipped rather than treated as fatal: unlike the
       two lines, whose absence means the copy has been rewritten out from
       under the phrase config, an absent eyebrow or button row just means
       there is nothing to bring on. */
    var extras = [];
    for (var e = 0; e < SUPPORTING.length; e++) {
      var extra = document.querySelector(SUPPORTING[e].selector);
      if (!extra) continue;
      extra.classList.add('ht-fx');
      extras.push({ el: extra, at: SUPPORTING[e].at });
    }

    /* Reduced motion is the one case that skips straight to the finished
       text. The CSS already forces every character visible, but the classes
       still need to go on so the line is marked done and the resting glow
       lands. */
    if (reduced) {
      for (var k = 0; k < lines.length; k++) {
        revealAll(lines[k]);
      }
      for (var x = 0; x < extras.length; x++) {
        extras[x].el.classList.add('is-on');
      }
      return;
    }

    whenVisible(lines[0].el, function () {
      run(hero, lines, extras);
    });
  }

  /* Runs fn the first time the headline is actually on screen, and never
     again.

     This is deliberately not a measurement taken once at load. The obvious
     version — measure the hero, type if it is in view, otherwise reveal
     everything instantly — is wrong twice over, and both ways were live in
     this file before this existed:

     - A deferred script runs as soon as parsing ends, and the browser does not
       scroll to a fragment until after that. On /#about the hero measures as
       perfectly in view at the exact moment the decision is made, and then the
       page jumps away from it.
     - Reading location.hash instead does answer that, but it answers a
       different question than the one that matters. Following any nav link
       leaves a hash in the address bar, so a reload from anywhere on the site
       carries one — and the animation would then be suppressed on most
       reloads, which is not "nobody was going to see it", it is just gone.

     An observer sidesteps the timing problem entirely by not caring when the
     scroll settles, and it turns the deep-link case into something better than
     a skip: land on /#about, scroll back up to the top later, and the headline
     types itself then, when you are looking at it. */
  function whenVisible(el, fn) {
    if (!window.IntersectionObserver) {
      fn();
      return;
    }

    /* Nearly all of the headline, not merely a sliver of it — a line clipped
       at the bottom edge of the viewport should not spend the effect. */
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          io.disconnect();
          fn();
          return;
        }
      }
    }, { threshold: 0.85 });

    io.observe(el);
  }

  /* ---- Splitting ------------------------------------------------------- */

  /* Rebuilds a line's text as <span class="ht-w"> per word, each holding one
     <span class="ht-c"> per character, with the original spaces left as plain
     text nodes between the words.

     The word wrapper exists only to stop a word breaking between its own
     characters — which it would, since they are now separate inline boxes. It
     does that with white-space: nowrap rather than display: inline-block,
     because inline-block would make each word an atomic box and change both
     the kerning and the way `text-wrap: balance` distributes the headline's
     lines. The point is for the split text to wrap exactly where the unsplit
     text did.

     Hidden characters keep their boxes (opacity, never display:none), so the
     browser lays the full sentence out once at load and typing never reflows
     anything. */
  function split(line) {
    var text = line.el.textContent;
    var frag = document.createDocumentFragment();
    var chars = [];
    var words = [];
    /* Splitting on the whitespace itself, kept in the result, so the original
       spacing survives verbatim rather than being reconstructed. */
    var tokens = text.split(/(\s+)/);

    for (var t = 0; t < tokens.length; t++) {
      var token = tokens[t];
      if (!token) continue;

      if (/^\s+$/.test(token)) {
        frag.appendChild(document.createTextNode(token));
        continue;
      }

      var word = document.createElement('span');
      word.className = 'ht-w';
      var startIndex = chars.length;

      for (var c = 0; c < token.length; c++) {
        var ch = document.createElement('span');
        ch.className = 'ht-c';
        ch.textContent = token.charAt(c);
        word.appendChild(ch);
        chars.push(ch);
      }

      frag.appendChild(word);
      words.push({
        span: word,
        /* Lower-cased and stripped of anything that is not a letter or digit,
           so "ship:" matches "ship" and "management." matches "management". */
        key: token.toLowerCase().replace(/[^a-z0-9]/g, ''),
        last: chars.length - 1,
        start: startIndex
      });
    }

    line.el.textContent = '';
    line.el.appendChild(frag);
    line.el.classList.add('ht-line', line.kind === 'title' ? 'ht-line--title' : 'ht-line--tag');

    line.chars = chars;
    line.words = words;
  }

  /* ---- Phrase matching ------------------------------------------------- */

  /* Finds each configured phrase in a line's word list and returns the
     character index it completes on, plus the word spans it covers — the spans
     are what the burst is measured against, so the emoji appear over the words
     they are celebrating rather than at some fixed point in the hero. */
  function findBursts(line) {
    var found = [];

    for (var b = 0; b < BURSTS.length; b++) {
      var wanted = BURSTS[b].phrase.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');

      for (var w = 0; w + wanted.length <= line.words.length; w++) {
        var hit = true;
        for (var n = 0; n < wanted.length; n++) {
          if (line.words[w + n].key !== wanted[n]) { hit = false; break; }
        }
        if (!hit) continue;

        var spans = [];
        for (var s = 0; s < wanted.length; s++) {
          spans.push(line.words[w + s].span);
        }

        found.push({
          /* Fires on the phrase's last character, so the burst arrives as the
             word completes rather than as it starts. */
          at: line.words[w + wanted.length - 1].last,
          spans: spans,
          emojis: BURSTS[b].emojis
        });
        /* First occurrence only — a repeated word should not fire twice. */
        break;
      }
    }

    return found;
  }

  /* ---- The run --------------------------------------------------------- */

  /* One requestAnimationFrame loop drives everything, and every character and
     event carries the absolute time it is due at. Driving from elapsed time
     rather than from a per-character timer means a dropped frame or a busy
     main thread costs no drift: the loop simply reveals every character that
     has come due since it last looked. */
  function run(hero, lines, extras) {
    var fx = makeLayer(hero);
    var queue = [];
    var events = [];
    var clock = START_DELAY;

    /* The supporting elements are placed as ordinary timeline events, so they
       are scheduled by the same clock that spaces the characters and cannot
       fall out of step with it when the pacing constants change. */
    var stages = { open: START_DELAY - 120, tag: null };

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var bursts = findBursts(line);
      var lineStart = clock;

      if (line.kind === 'tag') stages.tag = lineStart;

      for (var c = 0; c < line.chars.length; c++) {
        queue.push({ el: line.chars[c], at: lineStart + c * line.ms });
      }

      for (var b = 0; b < bursts.length; b++) {
        events.push({
          at: lineStart + bursts[b].at * line.ms,
          fn: burst(hero, fx, bursts[b].spans, bursts[b].emojis)
        });
      }

      var lineEnd = lineStart + (line.chars.length - 1) * line.ms;

      /* Drop the per-character animations once the last flash has run its
         course. Until this happens their fill keeps writing text-shadow at
         animation priority, which the shimmer sweep cannot override. */
      events.push({ at: lineEnd + SPARK_MS, fn: finish(line) });

      if (line.kind === 'title') {
        /* The sweep starts just after the headline is marked done — which is
           already after the tagline has begun typing. That overlap is the
           point: run them in sequence and the hero feels like a queue of
           animations waiting their turn. */
        events.push({ at: lineEnd + SPARK_MS + 20, fn: sweep(line) });
      }

      clock = lineEnd + line.ms + GAP;
    }

    for (var x = 0; x < extras.length; x++) {
      var when = stages[extras[x].at];
      /* A stage the timeline never reached — only possible if LINES is edited
         down — enters at the top rather than never. */
      events.push({ at: when === null || when === undefined ? 0 : when, fn: enter(extras[x].el) });
    }

    /* Sorted because the loop below walks this list with a single advancing
       cursor, which is only correct if it is in time order — and building it
       line by line does not produce that. The tagline's first emoji burst is
       due at 1802ms while the headline's sweep, pushed earlier because the
       headline is the earlier line, is due at 1850ms; unsorted, the burst
       waits behind the sweep. Here that costs 48ms and is invisible, but the
       error scales with whatever is configured, so sort rather than rely on
       the numbers staying small. */
    events.sort(function (a, b) { return a.at - b.at; });

    var t0 = null;
    var qi = 0;
    var ei = 0;
    var caret = null;

    function frame(now) {
      if (t0 === null) t0 = now;
      var elapsed = now - t0;

      /* Both lists are built in time order, so each is a single advancing
         cursor rather than a scan. */
      while (qi < queue.length && queue[qi].at <= elapsed) {
        if (caret) caret.classList.remove('is-caret');
        caret = queue[qi].el;
        caret.classList.add('is-on', 'is-caret');
        qi++;
      }

      while (ei < events.length && events[ei].at <= elapsed) {
        events[ei].fn();
        ei++;
      }

      if (qi < queue.length || ei < events.length) {
        requestAnimationFrame(frame);
      } else if (caret) {
        /* The caret belongs to the typing, not to the finished text. */
        caret.classList.remove('is-caret');
      }
    }

    requestAnimationFrame(frame);
  }

  function finish(line) {
    return function () {
      line.el.classList.add('is-done');
    };
  }

  function enter(el) {
    return function () {
      el.classList.add('is-on');
    };
  }

  function sweep(line) {
    return function () {
      line.el.classList.add('ht-line--sweep');
      /* Taken off again so the headline spends the rest of the session as
         ordinary text with an ordinary colour, rather than permanently painted
         by a gradient that a later theme change would have to fight. */
      setTimeout(function () {
        line.el.classList.remove('ht-line--sweep');
      }, SWEEP_MS + 40);
    };
  }

  /* ---- Emoji ----------------------------------------------------------- */

  /* The layer the emoji live in: over the hero, under nothing that matters,
     and invisible to assistive tech. .hero is already position: relative with
     its own stacking context, and .hero-orbs sits at z-index -1, so appending
     here is enough to land above the orbs and below the hero's own content
     without introducing another z-index to reason about. */
  function makeLayer(hero) {
    var layer = document.createElement('div');
    layer.className = 'hero-fx';
    layer.setAttribute('aria-hidden', 'true');
    hero.appendChild(layer);
    return layer;
  }

  /* Measures the words the phrase covers at the moment the burst fires — not
     when the page loaded — so the emoji land correctly whatever the line
     wrapped to at this viewport width. */
  function burst(hero, fx, spans, emojis) {
    return function () {
      var host = hero.getBoundingClientRect();
      var left = Infinity;
      var right = -Infinity;
      var top = Infinity;

      for (var s = 0; s < spans.length; s++) {
        var r = spans[s].getBoundingClientRect();
        /* A phrase that wrapped across two lines gives a union box spanning
           both; taking the topmost edge keeps the emoji above the first line
           of it rather than floating in the middle. */
        if (r.left < left) left = r.left;
        if (r.right > right) right = r.right;
        if (r.top < top) top = r.top;
      }

      /* An off-screen or unrendered phrase measures as a zero box; there is
         nothing to celebrate over. */
      if (!isFinite(left) || right <= left) return;

      var width = right - left;
      var baseY = top - host.top - 6;

      for (var e = 0; e < emojis.length; e++) {
        /* Spread across the phrase at the midpoints of equal slices, so two
           emoji sit at 1/4 and 3/4 rather than bunching at the ends. */
        var x = left - host.left + width * ((e + 0.5) / emojis.length);
        fly(fx, emojis[e], x, baseY, e);
      }
    };
  }

  function fly(fx, glyph, x, y, index) {
    var el = document.createElement('span');
    el.className = 'ht-emoji';
    el.textContent = glyph;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    fx.appendChild(el);

    /* Alternating drift, widening slightly with each emoji in the burst, so
       they fan out instead of travelling as a block. The whole burst is
       deterministic — random values here made the effect feel different on
       every reload without ever feeling better. */
    var dir = index % 2 === 0 ? -1 : 1;
    var dx = dir * EMOJI_DRIFT * (0.55 + index * 0.22);
    /* A tilt, not a spin. Rotation reads as cartoon physics well before it
       reads as craft, and nothing here was thrown by the reader's hand. */
    var tilt = dir * 7;

    /* translate(-50%,-50%) is what centres the emoji on the point it was given;
       every keyframe has to carry it, since a transform list replaces rather
       than adds to the one in the stylesheet. */
    function at(tx, ty, scale, rot) {
      return 'translate(-50%, -50%) translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ') rotate(' + rot + 'deg)';
    }

    /* Arrive, hold, depart — in three clearly separated acts rather than one
       continuous drift across the whole duration.

       The hold is the part that was missing. Without it the emoji is at its
       most visible only in passing, on its way from one edge of the animation
       to the other, and no single moment lets you actually identify what it
       is. Giving it roughly a third of the flight at full presence and almost
       no movement is what turns three glyphs going past into three glyphs you
       read.

       Enter and exit are deliberate mirrors of each other: both scale, both
       blur, in opposite directions. That symmetry is the same reason a panel
       dismisses along the path it arrived on — a thing that materialises one
       way and vanishes another reads as two unrelated events. And both ends
       are blurred rather than merely transparent, so the emoji resolves into
       being and dissolves out of it, matching how the characters behind it
       are already arriving.

       The overshoot is small on purpose. A pronounced bounce belongs to
       something the reader flicked; this arrived on its own, and at 1.03 the
       scale reads as settling rather than as bouncing. */
    var anim = el.animate([
      {
        transform: at(0, 6, 0.72, -tilt * 0.6),
        opacity: 0,
        filter: 'blur(10px)',
        offset: 0,
        /* easeOutExpo on the arrival alone: it covers nearly all of its
           distance immediately and settles slowly into the hold. */
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
      },
      {
        transform: at(dx * 0.3, -EMOJI_RISE * 0.34, 1.03, tilt * 0.4),
        opacity: 1,
        filter: 'blur(0px)',
        offset: 0.28,
        /* Barely moves through the hold. A gentle ease keeps the drift from
           reading as a stall followed by a restart. */
        easing: 'cubic-bezier(0.4, 0, 0.6, 1)'
      },
      {
        transform: at(dx * 0.46, -EMOJI_RISE * 0.5, 1, tilt * 0.6),
        opacity: 1,
        filter: 'blur(0px)',
        offset: 0.62,
        /* The departure accelerates away instead of decelerating — the mirror
           of the arrival, and the reason it reads as leaving rather than as
           running out of animation. */
        easing: 'cubic-bezier(0.7, 0, 0.84, 0)'
      },
      {
        transform: at(dx, -EMOJI_RISE, 0.86, tilt),
        opacity: 0,
        filter: 'blur(8px)',
        offset: 1
      }
    ], {
      duration: EMOJI_MS,
      delay: index * EMOJI_STAGGER,
      fill: 'both'
    });

    /* Self-cleaning: nothing accumulates in the DOM across the run, and the
       effects layer is empty again by the time the hero settles. */
    anim.onfinish = function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }

  /* ---- Helpers --------------------------------------------------------- */

  function revealAll(line) {
    for (var i = 0; i < line.chars.length; i++) {
      line.chars[i].classList.add('is-on');
    }
    line.el.classList.add('is-done');
  }

  /* ---- Boot ------------------------------------------------------------ */

  /* Waits for the webfont before measuring or typing anything. Inter is loaded
     asynchronously with display=swap, so starting early means the fallback
     face gets split and laid out, and the swap then rewraps the line under a
     half-typed effect — the one thing the opacity-based reveal is designed to
     avoid. The timeout is there so a font that never resolves delays the hero
     rather than cancelling it. */
  function boot() {
    var started = false;
    function go() {
      if (started) return;
      started = true;
      start();
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(go);
      setTimeout(go, 1200);
    } else {
      go();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
