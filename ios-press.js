/*
 * [ios-press] The press latch. Everything about the press that CSS cannot say.
 *
 * ios-press.css carries the look — the squash going in, the settle coming out
 * — and hangs the squash on both :active and [data-pressed]. :active alone
 * gets the timing right and the behaviour wrong in three ways:
 *
 *   1. It is late on touch. Safari holds :active back until it has decided the
 *      touch is not the start of a scroll, so the press lands after the finger
 *      does. iOS itself highlights on contact and takes the highlight away
 *      again if the finger moves — the confidence comes from the press being
 *      instant, not from it being correct.
 *
 *   2. It does not track. Press a button, slide off it, let go: iOS drops the
 *      highlight the moment you leave and brings it back if you return, and
 *      the button does not fire. :active on touch stays lit wherever the
 *      finger goes.
 *
 *   3. It cannot start the follow-through. The settle is a reaction to the
 *      press ENDING, and there is no CSS selector for a state being left —
 *      :not([data-pressed]) matches every untouched button on the page, so the
 *      animation would run on all of them at load. So the release is marked
 *      here instead, with data-released, for exactly as long as it takes.
 *
 * Which of the two ways out you get is the other thing this file decides, and
 * it is the part worth not flattening later:
 *
 *   a completed press — finger up on the control, or a key released — unwinds
 *   through the full settle. It earned the bounce.
 *
 *   a cancelled press — the finger slid off, the browser took the pointer for
 *   a scroll, the window lost focus — just relaxes back on the transition
 *   curve, with no follow-through at all. Nothing happened, so nothing should
 *   celebrate; a button bouncing under a thumb that is busy scrolling past it
 *   reads as a glitch. iOS drops its highlight the same way.
 *
 * It never calls preventDefault and every pointer listener is passive, so it
 * cannot swallow a click, block a scroll, or change what any control does. All
 * it writes is two attributes.
 *
 * The scroll cancel is not written here and does not need to be: when a touch
 * that started on a button turns into a page scroll, the browser takes the
 * pointer over and fires pointercancel, which is already one of the ways out.
 * That is also why nothing here sets touch-action — the moment it did, the
 * browser would stop reporting the scroll and the press would stick to a
 * finger that has moved on.
 *
 * Remove by deleting this file, ios-press.css and their two tags in
 * index.html. See REMOVE-IOS-PRESS.md.
 */
(function () {
  'use strict';

  /* Kept in step with the tiers in ios-press.css. Anything listed there is
     listed here; .mp-item is in neither, on purpose — see that file. */
  var SELECTOR = [
    '.btn',
    '.nav-links a',
    /* The company name in each timeline entry. The logo tile beside it was
       already here and links to the same page, so without this one pressing
       the mark did something and pressing the name did nothing. */
    '.timeline-company a',
    '.nav-toggle',
    '.link-pop-close',
    '.link-pop-play',
    '.work-tile',
    '.link-pop-shot',
    '.cert-shot-link',
    'a.timeline-logo',
    '.mp-back',
    '.skip-link',
    '.logo'
  ].join(',');

  /* How far off the control the pointer may stray before the press lets go.
     iOS is generous here — a press survives a wander of well over a finger
     width, because a thumb rolls on the way down and a press that flickers off
     under a 2px tremor reads as a broken button rather than a precise one. */
  var SLOP = 32;

  /* How long data-released stays on. Read from the stylesheet rather than
     repeated here, so retuning --press-settle cannot leave this behind and cut
     the animation off mid-swing. The margin covers the frame the animation
     starts on; the fallback covers ios-press.css having been deleted, when the
     value comes back empty and there is no animation to wait for anyway. */
  var SETTLE_MS = (function () {
    var v = getComputedStyle(document.documentElement)
      .getPropertyValue('--press-settle')
      .trim();
    var ms = /ms$/.test(v) ? parseFloat(v) : parseFloat(v) * 1000;
    return (ms > 0 ? ms : 540) + 120;
  })();

  var held = null; // element under an active pointer press
  var heldId = null; // its pointerId, so a second finger cannot steal it
  var box = null; // its rect, measured before the press squashed it
  var keyed = null; // element held down by the keyboard

  /* Elements currently running the settle, against the timer that will take
     the attribute off. Held here rather than on the element so that a node
     removed from the document mid-settle cannot keep anything alive. */
  var settling = new Map();

  function endSettle(el) {
    var timer = settling.get(el);
    if (timer !== undefined) {
      clearTimeout(timer);
      settling.delete(el);
    }
    delete el.dataset.released;
  }

  function press(el) {
    /* pointermove re-asserts the press on every frame the pointer is inside
       the control, so this has to be free to call repeatedly. */
    if (el.dataset.pressed) return;
    /* A settle still in flight has to go before the new squash is asked for.
       A running animation outranks every normal declaration in the cascade, so
       left on it would animate straight through the press. */
    endSettle(el);
    el.dataset.pressed = 'on';
  }

  /* settle=true unwinds through the follow-through, settle=false just relaxes
     on the transition curve. See the note at the top of the file. */
  function lift(el, settle) {
    if (!el || !el.dataset.pressed) return;
    delete el.dataset.pressed;
    if (!settle) return;

    endSettle(el);
    el.dataset.released = 'on';
    /* On a timer rather than on animationend alone, because there are three
       ways the animation never fires one: prefers-reduced-motion turns it off,
       a control that went display:none mid-press never starts it, and
       ios-press.css may not be here at all. animationend below is the fast
       path; this is the one that cannot fail to clean up. */
    settling.set(
      el,
      setTimeout(function () {
        endSettle(el);
      }, SETTLE_MS)
    );
  }

  /* The fast path off data-released. Named animation, so a settle finishing on
     one control is never confused with any other animation on the page. */
  document.addEventListener(
    'animationend',
    function (e) {
      if (e.animationName !== 'press-settle') return;
      if (e.target && e.target.dataset && e.target.dataset.released) {
        endSettle(e.target);
      }
    },
    true
  );

  function endPointer(settle) {
    lift(held, settle);
    held = null;
    heldId = null;
    box = null;
  }

  function target(node) {
    if (!node || typeof node.closest !== 'function') return null;
    /* closest() takes the innermost match, which is the one that should press:
       a play button inside a preview panel presses the button, not the panel's
       thumbnail around it. */
    var el = node.closest(SELECTOR);
    if (!el) return null;
    if (el.disabled) return null;
    if (el.getAttribute('aria-disabled') === 'true') return null;
    return el;
  }

  function inside(e) {
    return (
      e.clientX >= box.left - SLOP &&
      e.clientX <= box.right + SLOP &&
      e.clientY >= box.top - SLOP &&
      e.clientY <= box.bottom + SLOP
    );
  }

  document.addEventListener(
    'pointerdown',
    function (e) {
      /* Right and middle clicks open menus, they do not press buttons. Touch
         and pen report button 0 as well, so this only ever filters a mouse. */
      if (e.button !== 0) return;

      var el = target(e.target);
      if (!el) return;

      /* A second finger landing elsewhere while the first is still down. The
         first press is the one that counts, so the new one is dropped rather
         than allowed to overwrite heldId and orphan the squashed element. */
      if (held && e.pointerId !== heldId) return;

      held = el;
      heldId = e.pointerId;
      /* Measured before the press is applied. The control deforms under it, so
         re-measuring on every move would test the pointer against a box that
         is itself moving, and the press would let go while the finger was
         still on the button. This is a fixed region for the life of the
         gesture, which is also how iOS treats it. */
      box = el.getBoundingClientRect();
      press(el);
    },
    { passive: true }
  );

  /* Touch pointers are implicitly captured by the element they started on, so
     these still arrive — and still bubble to the document — after the finger
     has left that element, which is exactly the case being handled.

     Sliding off is a withdrawal, not a release: no follow-through. Sliding
     back on squashes it again. */
  document.addEventListener(
    'pointermove',
    function (e) {
      if (!held || e.pointerId !== heldId) return;
      if (inside(e)) press(held);
      else lift(held, false);
    },
    { passive: true }
  );

  /* The one way out that earns the settle. */
  document.addEventListener(
    'pointerup',
    function (e) {
      if (!held || e.pointerId !== heldId) return;
      /* Up outside the control is a withdrawal too — the click will not fire
         either, so the button must not act as though it did. */
      endPointer(inside(e));
    },
    { passive: true }
  );

  /* The browser taking the pointer over: a scroll starting, a long press
     turning into a callout or a text selection, a native drag beginning.
     None of them are presses, so none of them bounce. */
  document.addEventListener(
    'pointercancel',
    function (e) {
      if (held && e.pointerId === heldId) endPointer(false);
    },
    { passive: true }
  );

  /* Tabbing away, switching apps, or a dialog opening mid-press. Without this
     the button is still squashed when the page comes back and nothing will
     ever fire the pointerup that would have cleared it. */
  window.addEventListener('blur', function () {
    endPointer(false);
  });

  /* Keyboard activation. Browsers style this with :active on a <button>, but
     not on an <a>, and not at all on the ones reached through a wrapper — so
     it is modelled here rather than left half-working.

     Held in its own variable: a keyboard press and a pointer press can overlap
     on different elements, and sharing one slot would leave whichever lost
     squashed forever. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Spacebar' && e.key !== 'Enter') return;
    /* Holding the key repeats keydown; the press is already on. */
    if (e.repeat) return;
    var el = target(document.activeElement);
    if (!el || el === keyed) return;
    lift(keyed, false);
    keyed = el;
    press(el);
  });

  /* A key released over the control it was pressed on is a completed press. */
  document.addEventListener('keyup', function () {
    lift(keyed, true);
    keyed = null;
  });

  /* Enter on a link navigates and Space scrolls the page from some controls;
     either can move focus before keyup arrives, and a keyup that lands on the
     document with the element gone would leave it squashed. */
  document.addEventListener(
    'blur',
    function () {
      lift(keyed, false);
      keyed = null;
    },
    true
  );
})();
