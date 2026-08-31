/* [text-glow] Removable feature.
   Splits the About paragraph into words, groups those words into the lines the
   browser actually rendered, and lights one line at a time as the page
   scrolls. Scroll decides which line the light is heading for; a pace cap
   decides how fast it gets there. Touches nothing outside its own paragraph
   and binds no shared state, so deleting this file and text-glow.css removes
   the feature completely. See REMOVE-TEXT-GLOW.md. */
(function () {
  'use strict';

  /* Scoped to the About paragraph alone. The contact section reuses
     .about-text, and lighting a second paragraph the same way spends the
     effect. Widen this one string to extend it. */
  var SELECTOR = '#about .about-text';

  /* How the handoff between two lines reads, as a fraction of one line. A line
     is at full brightness while the light is inside it; this carves a ramp out
     of each end, straddling the boundary so the outgoing and incoming lines
     cross at half brightness each and sum to one. At 0.2 a line holds full
     brightness for 60% of its turn and cross-fades for the other 40% — about
     0.29s at the pace below, which reads as one line lit with a soft handoff
     rather than two lines lit at once. 0 is a hard cut with no overlap; 0.5
     removes the plateau entirely and the light never fully settles on a line,
     which is the thing this version exists to avoid. */
  var FADE_LINES = 0.2;

  /* How fast the light is allowed to travel, in lines per second. This is the
     pace knob: 1.4 crosses this paragraph's seven lines in about 4.8 seconds,
     so a line holds the light for roughly two thirds of a second. Scroll sets
     where the light is heading; this caps how quickly it may get there.

     The crossover sits near 85px of scroll per second: below that the light
     tracks the scrollbar exactly and the cap may as well not exist, above it
     the cap governs. Raise it toward 3 and lines flash past; below about 0.7
     the light is slower than the reader and becomes something to wait for.

     Note this is lines, not words. A narrow viewport wraps the same paragraph
     into more, shorter lines, so the run takes longer on a phone than on a
     laptop — deliberately, since a line is a line and stepping through short
     ones at laptop speed would strobe. */
  var READ_LPS = 1.4;

  /* Where the light enters and leaves, as fractions of viewport height, both
     read off the rendered page. The first line lights when the paragraph's top
     edge reaches 69% of the viewport — the whole paragraph just clear of the
     fold, hero still above it. The light arrives on the last line once the
     paragraph's bottom edge passes 42%, which is About pinned near the top of
     the screen with the run visibly complete.

     These two are not the pace knob. The span between them is about 410px, so
     scroll commands the whole run in half a screen and READ_LPS plays it out
     from there. Keep START above END; the code assumes the range is positive,
     and a START below END runs the light backwards. */
  var START = 0.69;
  var END = 0.42;

  /* A reader who has asked for less motion should not get a light chasing
     their scrollbar. Bail before splitting: the paragraph is then never
     touched at all and renders exactly as it did before this file existed. */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var source = document.querySelector(SELECTOR);
  if (!source) return;

  /* Collapse the source indentation the same way the renderer already does,
     so the split text matches what was on screen a moment ago. */
  var text = source.textContent.replace(/\s+/g, ' ').trim();
  if (!text) return;

  /* ---- Split -------------------------------------------------------- */

  /* Words, not letters and not sentences. A word is the finest unit that can
     be lit without a screen reader spelling it out, and it is the unit line
     grouping needs: a line is not a thing that exists in the source, so it has
     to be measured from where the words landed. The paragraph stays plain text
     inside plain spans, so the visible copy is still the accessible copy and
     no hidden duplicate is needed. */

  /* One exception, and it is not cosmetic. A hyphen is a line-break
     opportunity, so "user-centric" can render as two boxes on two different
     lines — and offsetTop reports only the first, which would file the whole
     span under the earlier line and light "centric" a line early. Breaking the
     span after each hyphen gives each rendered fragment its own element and
     its own offsetTop. The spans sit flush against each other with no text
     between them, and inline boundaries create no break opportunities of their
     own, so the paragraph renders and wraps exactly as before. */
  function fragments(word) {
    var out = [];
    var start = 0;
    for (var i = 0; i < word.length - 1; i++) {
      if (word.charAt(i) === '-') {
        out.push(word.slice(start, i + 1));
        start = i + 1;
      }
    }
    out.push(word.slice(start));
    return out;
  }

  var split = document.createElement('span');
  split.className = 'tg-split';

  var wordEls = [];
  var frag = document.createDocumentFragment();
  var words = text.split(' ');

  words.forEach(function (word, w) {
    fragments(word).forEach(function (piece) {
      var el = document.createElement('span');
      el.className = 'tg-word';
      el.textContent = piece;
      frag.appendChild(el);
      wordEls.push(el);
    });

    /* Spaces stay plain text nodes between the words. They are the only
       line-break opportunities in the paragraph besides the hyphens above,
       which is exactly where they were before the split. */
    if (w < words.length - 1) frag.appendChild(document.createTextNode(' '));
  });

  if (!wordEls.length) return;

  split.appendChild(frag);
  source.textContent = '';
  source.appendChild(split);

  /* ---- Geometry ------------------------------------------------------ */

  /* Layout is read here and on resize, never inside the scroll handler. Same
     reasoning as the nav spy in script.js, which caches its offsets for the
     same reason. */
  var scrollStart = 0;
  var scrollSpan = 1;

  /* Document-space bounds of the paragraph, kept so the follower can ask
     "is this on screen?" from arithmetic instead of a second layout read. */
  var docTop = 0;
  var docHeight = 0;

  /* Paint's only state, declared up here because measure() resets it: the
     window of lines lit by the last frame. It is at most two lines wide — one
     full, one mid-handoff — so a frame clears the words it lit last time and
     writes the words it lights now, and that is bounded however far the page
     jumped. Scrolling straight to #about costs the same as nudging the wheel
     one notch. Parking on the last line costs nothing at all: the light stops
     moving, paint's early return fires, and no frame does any work. */
  var prevLo = 0;
  var prevHi = -1;
  var lastPos = NaN;

  /* Guards the divisions in paint, so FADE_LINES: 0 means "hard cut" rather
     than "NaN everywhere". */
  var fade = FADE_LINES > 0.001 ? FADE_LINES : 0.001;

  /* Which words share a rendered line. Rebuilt whenever the paragraph might
     have re-wrapped, because a line is a fact about layout and nothing else. */
  var lineFirst = [];
  var lineLast = [];
  var nLines = 1;
  var maxRate = 1;

  function groupLines() {
    lineFirst.length = 0;
    lineLast.length = 0;

    /* offsetTop is identical for every word on a line — inline boxes of the
       same font share a line box — so the grouping is exact and the 4px
       tolerance only absorbs sub-pixel noise. Reads run back to back with no
       writes between them, so this costs one layout, not one per word. */
    var lineTop = wordEls[0].offsetTop;
    lineFirst.push(0);

    for (var i = 1; i < wordEls.length; i++) {
      var top = wordEls[i].offsetTop;
      if (top - lineTop > 4) {
        lineLast.push(i - 1);
        lineFirst.push(i);
        lineTop = top;
      }
    }
    lineLast.push(wordEls.length - 1);

    nLines = lineFirst.length;

    /* Progress is measured over (nLines - 0.5 + FADE_LINES) line-widths — the
       lead-in, then every line up to the middle of the last one — so lines per
       second converts to progress per second by dividing by that same span.
       Uses the same guarded `fade` paint does, so the two stay in step even at
       FADE_LINES: 0 — otherwise the light would travel at a pace that does not
       match its own range. */
    maxRate = READ_LPS / (nLines - 0.5 + fade);
  }

  function measure() {
    /* Re-wrapping can move a word from one line to another, so anything the
       old grouping lit could otherwise be stranded outside the new window and
       stay bright. Clear the lot and start the bookkeeping over. */
    for (var i = 0; i < wordEls.length; i++) wordEls[i].style.removeProperty('--tg');
    prevLo = 0;
    prevHi = -1;

    groupLines();

    var rect = source.getBoundingClientRect();
    var top = rect.top + window.pageYOffset;
    var vh = window.innerHeight;

    docTop = top;
    docHeight = rect.height;

    /* Clamped at 0 because a negative start is a scroll position the page can
       never be at, which would leave the light already part-way down the
       paragraph before the reader has scrolled at all. At START = 0.69 the
       origin sits around 160px into the document on a laptop, so this rarely
       bites — but a short hero or a very tall viewport can still push it
       negative, and the failure is silent, so the clamp stays. */
    scrollStart = top - vh * START;
    if (scrollStart < 0) scrollStart = 0;

    var scrollEnd = top + rect.height - vh * END;

    /* If the paragraph sits close enough to the end of the document that the
       page runs out of scroll before the run finishes, pull the finish line
       back to the last reachable scroll position. Otherwise the light could
       never reach the final line. */
    var maxScroll = document.documentElement.scrollHeight - vh;
    if (scrollEnd > maxScroll) scrollEnd = maxScroll;

    scrollSpan = scrollEnd - scrollStart;
    if (scrollSpan < 1) scrollSpan = 1;
  }

  /* ---- Paint --------------------------------------------------------- */

  function paint(progress) {
    /* Where the light is, in line-space: line L occupies [L, L+1]. It starts a
       fade before line 0, so the paragraph is dark at the top of the range and
       the first line warms up rather than snapping on.

       It ends in the *middle* of the last line, not past it: progress 1 puts
       the position at nLines - 0.5, so the run arrives on the final line and
       parks at full brightness. Because progress is clamped to 1, scrolling
       further changes nothing and that line stays lit for as long as the
       paragraph is on screen — the run reads as completed rather than as
       having faded away. */
    var pos = progress * (nLines - 0.5 + fade) - fade;

    /* Scroll that has not moved the light paints nothing new. */
    if (Math.abs(pos - lastPos) < 0.0001) return;
    lastPos = pos;

    /* Every line whose ramp the position is inside: L > pos - 1 - fade and
       L < pos + fade. That window is 1 + 2·fade wide, so it holds one line
       most of the time and two through a handoff. */
    var lo = Math.floor(pos - 1 - fade) + 1;
    if (lo < 0) lo = 0;
    var hi = Math.ceil(pos + fade) - 1;
    if (hi > nLines - 1) hi = nLines - 1;

    var L, i;

    /* Clear last frame's window first. Anything still lit is rewritten below;
       anything the light has left behind correctly falls back to --tg's
       initial 0, which is the "faded out" state. */
    for (L = prevLo; L <= prevHi; L++) {
      for (i = lineFirst[L]; i <= lineLast[L]; i++) {
        wordEls[i].style.removeProperty('--tg');
      }
    }

    for (L = lo; L <= hi; L++) {
      /* Signed distance to the line: positive outside it, negative by the
         depth once inside. Measuring depth rather than distance-to-centre is
         what gives the flat top — the light is equally full anywhere in the
         middle of a line instead of bulging around one word. */
      var x;
      if (pos < L) x = L - pos;
      else if (pos > L + 1) x = pos - (L + 1);
      else {
        var fromStart = pos - L;
        var fromEnd = (L + 1) - pos;
        x = -(fromStart < fromEnd ? fromStart : fromEnd);
      }

      /* Full inside the plateau, dark past the ramp, raised cosine across it.
         The ramp is centred on the line boundary, so the outgoing and incoming
         lines are both at 0.5 exactly when the light crosses the seam and the
         two sum to 1 the whole way through — no dip, no double-bright frame.
         A raised cosine rather than a linear ramp because its slope is zero at
         both ends: a line warms and cools with no detectable moment of
         starting or stopping. */
      var v;
      if (x <= -fade) v = 1;
      else if (x >= fade) v = 0;
      else v = 0.5 * (1 + Math.cos(Math.PI * (x + fade) / (2 * fade)));

      /* Below a thousandth there is nothing on screen to see, and the clear
         above has already unset it. */
      if (v < 0.001) continue;

      var s = v.toFixed(3);
      for (i = lineFirst[L]; i <= lineLast[L]; i++) {
        wordEls[i].style.setProperty('--tg', s);
      }
    }

    prevLo = lo;
    prevHi = hi;
  }

  /* ---- Drive --------------------------------------------------------- */

  /* Two positions, not one. `target` is where scroll says the light belongs —
     the same pure mapping this feature always had. `shown` is where the light
     actually is, and it walks toward the target at no more than READ_LPS.

     That gap is the whole feature: welded straight to the scrollbar, one wheel
     notch throws the light three lines forward and the paragraph flickers.
     Capped, a flick becomes a sweep — the light still crosses every line, just
     at a pace a reader can follow. Scroll slower than the cap and the two
     positions stay equal, so nothing is interposed between scroll and light. */
  var target = 0;
  var shown = 0;

  var raf = 0;
  var lastT = 0;

  function readTarget() {
    var p = (window.pageYOffset - scrollStart) / scrollSpan;
    if (p < 0) p = 0;
    else if (p > 1) p = 1;
    target = p;
  }

  /* Cheap because measure() cached the paragraph's document-space bounds:
     no getBoundingClientRect on the scroll path, same rule the nav spy in
     script.js follows. */
  function onScreen() {
    var top = window.pageYOffset;
    return top + window.innerHeight > docTop && top < docTop + docHeight;
  }

  function tick(now) {
    raf = 0;

    /* First frame of a run has no elapsed time to measure. Later frames clamp
       dt, so a backgrounded tab or a long frame resumes at reading pace
       instead of lurching forward by however long the gap was. */
    var dt = lastT ? (now - lastT) / 1000 : 0;
    if (dt > 0.1) dt = 0.1;
    lastT = now;

    var step = maxRate * dt;
    var gap = target - shown;

    /* Within one step of the target, land on it exactly — otherwise `shown`
       creeps by fractions forever and the loop never gets to stop. */
    if (Math.abs(gap) <= step) shown = target;
    else shown += gap > 0 ? step : -step;

    paint(shown);

    /* Self-stopping: the loop exists only while there is a gap to close, so a
       page sitting still costs nothing. */
    if (shown !== target) raf = requestAnimationFrame(tick);
    else lastT = 0;
  }

  function request() {
    readTarget();

    /* Off screen there is no one to watch the light travel, and crawling
       through a paragraph nobody is looking at means scrolling back to a stale
       picture. Jump it to where scroll says it should be. */
    if (!onScreen()) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      lastT = 0;
      shown = target;
      paint(shown);
      return;
    }

    if (!raf) raf = requestAnimationFrame(tick);
  }

  function remeasure() {
    measure();
    /* Geometry moved, so the cached position is stale even if scroll did not
       change. Force the next paint through. */
    lastPos = NaN;
    request();
  }

  measure();

  /* On load the light starts wherever scroll already is rather than crawling
     up to it from the first line — arriving mid-page should look like the
     reader simply caught it there, not like a replay starting. */
  readTarget();
  shown = target;
  paint(shown);

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', remeasure);

  /* Inter arriving re-flows the paragraph: it changes the height, which moves
     both ends of the scroll range, and it re-wraps the text, which changes
     which words sit on which line. Both are rebuilt by remeasure, and for this
     feature the second one is not optional. The font stylesheets in index.html
     load non-blocking, so the first measure() runs against the fallback font,
     which fits a different number of words on a line. Left uncorrected, the
     light writes one brightness across a set of words that straddles two real
     lines — which is exactly what it did: measured in Chromium, one written
     value covered two different offsetTops until something forced a re-group.

     document.fonts.ready alone does not catch it. With a non-blocking
     stylesheet there may be no pending faces at the moment it is awaited, so
     it resolves against the fallback and never fires again. 'loadingdone'
     fires when a batch of faces actually finishes loading, which is the swap
     itself. */
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(remeasure).catch(function () {});
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', remeasure);
    }
  }

  /* The backstop for everything else that re-wraps the paragraph without a
     window resize: a container width change, browser zoom, a late font this
     file never hears about. It cannot feed itself — measure() only reads
     layout and writes inline custom properties, and neither colour nor
     text-shadow changes a box's size. */
  if (window.ResizeObserver) new ResizeObserver(remeasure).observe(source);
})();
