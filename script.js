document.getElementById('year').textContent = new Date().getFullYear();

// Droplet-lens refraction on the floating nav. See glass.js — the bend peaks
// at the rim and decays smoothly inward, so text crossing the pill warps
// instead of tearing at a hard boundary.
if (typeof liquidGlass === 'function') {
  const header = document.querySelector('.header-inner');
  if (header) {
    liquidGlass(header, {
      band: 30,
      scale: 130,
      // Dispersion is safe to push here in a way it wasn't with the old
      // library: the map is neutral across the flat centre, so the split can
      // only appear in the curved rim band where real glass disperses.
      dispersion: 0.15,
      blur: 2,
      saturate: 1.7,
      fallbackBlur: 6
    });
  }

  // The nav pills deliberately get no lens of their own. A backdrop-filter
  // nested inside the bar's own backdrop-filter compounds — the pills render
  // as opaque grey slabs. Their droplet character is done in CSS instead.
}

// Pointer response on the hero orbs. Two effects stack into the one transform
// this element owns:
//   1. Parallax — the whole field leans with the pointer, each orb at its own
//      data-depth, so they part at different rates and the field reads as
//      having space in it.
//   2. Repulsion — an orb the cursor comes near is shoved directly away from
//      it, hardest at point-blank and fading to nothing at the edge of its
//      reach. This is the part you actually see: parallax alone moves a 480px
//      cloud by ~19px, which is below the threshold of noticing.
// The written transform lives on .orb while the CSS keyframes live on its
// child, so the two never overwrite each other.
(function () {
  const field = document.querySelector('.hero-orbs');
  const hero = document.querySelector('.hero');
  if (!field || !hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Coarse pointers have no hover to track, and the work would be wasted.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  // How far the cursor shoves an orb at dead centre, how far its influence
  // carries as a multiple of that orb's own radius, and how much the orb
  // swells while disturbed. REACH sits above 1 so the push begins just before
  // the cursor reaches the visible edge of the blob rather than at its middle.
  const PUSH = 68;
  const REACH = 1.15;
  const SWELL = 0.07;
  const EASE = 0.08;

  const orbs = [...field.querySelectorAll('.orb')].map((el) => ({
    el,
    depth: parseFloat(el.dataset.depth) || 0,
    cx: 0,
    cy: 0,
    reach: 1,
    // Where the orb is being asked to go, and where it currently is.
    tx: 0,
    ty: 0,
    ts: 1,
    x: 0,
    y: 0,
    s: 1
  }));

  let pointerX = null;
  let pointerY = null;
  let running = false;
  let visible = true;

  // Orb centres, in coordinates local to the field. offsetLeft/offsetTop are
  // measured from the untransformed box, so reading them can't feed our own
  // output back into the next frame — getBoundingClientRect would, since it
  // reports the element after the transform we just wrote.
  function measure() {
    for (const orb of orbs) {
      const r = orb.el.offsetWidth / 2;
      orb.cx = orb.el.offsetLeft + r;
      orb.cy = orb.el.offsetTop + orb.el.offsetHeight / 2;
      orb.reach = r * REACH;
    }
  }

  function clamp(n) {
    return n < -0.5 ? -0.5 : n > 0.5 ? 0.5 : n;
  }

  function aim() {
    if (pointerX === null) return;
    const f = field.getBoundingClientRect();
    const h = hero.getBoundingClientRect();
    const px = pointerX - f.left;
    const py = pointerY - f.top;
    // Parallax term: pointer offset from the hero's centre, normalised to the
    // hero's own size so it reads the same at any viewport width. Clamped
    // because the hero is shorter than the viewport — a cursor down by the
    // fold is more than a full hero-height off centre, and unclamped that
    // drags the field twice as far as the tuning intends.
    const nx = clamp((pointerX - (h.left + h.width / 2)) / h.width);
    const ny = clamp((pointerY - (h.top + h.height / 2)) / h.height);

    for (const orb of orbs) {
      const dx = orb.cx - px;
      const dy = orb.cy - py;
      // Guard the zero case: at the exact centre there's no direction to push
      // along, and dividing by it would put NaN into the transform.
      const dist = Math.hypot(dx, dy) || 0.0001;
      // Squared falloff rather than linear. A linear ramp still carries
      // velocity as it reaches the edge of the reach, so the orb visibly kicks
      // the moment the cursor crosses in or out; squaring lands it soft.
      const fade = dist >= orb.reach ? 0 : (1 - dist / orb.reach) ** 2;
      const shove = (PUSH * fade) / dist;

      orb.tx = nx * orb.depth + dx * shove;
      orb.ty = ny * orb.depth + dy * shove;
      orb.ts = 1 + SWELL * fade;
    }
  }

  function frame() {
    let moving = false;

    for (const orb of orbs) {
      // Ease toward the target so the orbs trail the cursor rather than snap
      // to it — the lag is what sells them as having mass.
      orb.x += (orb.tx - orb.x) * EASE;
      orb.y += (orb.ty - orb.y) * EASE;
      orb.s += (orb.ts - orb.s) * EASE;

      orb.el.style.transform =
        'translate3d(' + orb.x.toFixed(2) + 'px,' + orb.y.toFixed(2) + 'px,0) scale(' +
        orb.s.toFixed(4) + ')';

      if (
        Math.abs(orb.tx - orb.x) > 0.05 ||
        Math.abs(orb.ty - orb.y) > 0.05 ||
        Math.abs(orb.ts - orb.s) > 0.0004
      ) {
        moving = true;
      }
    }

    // Park the loop once the motion has settled instead of burning frames.
    if (visible && moving) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function wake() {
    if (running || !visible) return;
    running = true;
    requestAnimationFrame(frame);
  }

  measure();

  window.addEventListener(
    'pointermove',
    (e) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      aim();
      wake();
    },
    { passive: true }
  );

  // Leaving the window would otherwise strand the field mid-push, holding a
  // dent around a cursor that is no longer there.
  document.documentElement.addEventListener('pointerleave', () => {
    pointerX = null;
    pointerY = null;
    for (const orb of orbs) {
      orb.tx = 0;
      orb.ty = 0;
      orb.ts = 1;
    }
    wake();
  });

  window.addEventListener(
    'resize',
    () => {
      measure();
      aim();
      wake();
    },
    { passive: true }
  );

  // Nothing to react to once the hero has scrolled away.
  new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      field.style.animationPlayState = visible ? '' : 'paused';
      for (const orb of orbs) {
        // Every tint layer, not just the first — the colour rotation lives on
        // all four, and pausing one of them alone would desync the crossfade.
        for (const layer of orb.el.children) {
          layer.style.animationPlayState = visible ? '' : 'paused';
        }
      }
      if (visible) wake();
    },
    { threshold: 0 }
  ).observe(hero);
})();

const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

let closeTimeout = null;

function openMenu() {
  clearTimeout(closeTimeout);
  navLinks.classList.add('open');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      navLinks.classList.add('is-visible');
    });
  });
  navToggle.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeMenu() {
  navLinks.classList.remove('is-visible');
  navToggle.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  clearTimeout(closeTimeout);
  closeTimeout = setTimeout(() => {
    navLinks.classList.remove('open');
  }, 220);
}

navToggle.addEventListener('click', () => {
  navLinks.classList.contains('open') ? closeMenu() : openMenu();
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    closeMenu();
  });
});

// Scroll spy: keep the nav in sync with the section in view
const navAnchors = new Map();
document.querySelectorAll('.nav-links a[href^="#"]').forEach((a) => {
  const target = document.getElementById(a.getAttribute('href').slice(1));
  if (target) navAnchors.set(target, a);
});

const spySections = [...navAnchors.keys()].sort((a, b) => a.offsetTop - b.offsetTop);

function updateActiveNav() {
  // Offset by the sticky header so a section counts as "current" once it
  // reaches the point where it's actually readable.
  const probe = window.scrollY + 100;
  let current = null;

  for (const section of spySections) {
    if (section.offsetTop <= probe) current = section;
  }

  // At the very bottom the last section may be too short to ever pass the
  // probe line — treat reaching the end as landing on it.
  const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
  if (atBottom && spySections.length) current = spySections[spySections.length - 1];

  navAnchors.forEach((anchor, section) => {
    const active = section === current;
    anchor.classList.toggle('is-active', active);
    if (active) {
      anchor.setAttribute('aria-current', 'true');
    } else {
      anchor.removeAttribute('aria-current');
    }
  });
}

let spyTicking = false;
function requestNavUpdate() {
  if (spyTicking) return;
  spyTicking = true;
  requestAnimationFrame(() => {
    updateActiveNav();
    spyTicking = false;
  });
}

window.addEventListener('scroll', requestNavUpdate, { passive: true });
window.addEventListener('resize', requestNavUpdate, { passive: true });
updateActiveNav();

// Scroll reveal
const revealTargets = document.querySelectorAll(
  '.about-content, .about-photo, .timeline-item, .card, .testimonial, .skills-group'
);

revealTargets.forEach((el) => el.classList.add('reveal'));

document.querySelectorAll('.timeline, .card-grid, .testimonial-grid, .skills-grid').forEach((group) => {
  Array.from(group.children).forEach((child, i) => {
    child.style.transitionDelay = `${i * 50}ms`;
  });
});

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealTargets.forEach((el) => revealObserver.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('is-visible'));
}

// Droplet project links. Reveal and dismissal are CSS (:hover / :focus-within
// on the .work-link group); only the two things CSS can't express live here.
(function () {
  const links = document.querySelectorAll('.work-link');
  if (!links.length) return;

  links.forEach((group) => {
    const shots = group.querySelectorAll('.link-pop-shot img');

    shots.forEach((img) => {
      // A gallery slot whose file isn't in assets/. Chrome paints a broken
      // image glyph over the placeholder, so drop the img and let the slot's
      // own background stand — the panel keeps its shape either way.
      img.addEventListener('error', () => {
        img.hidden = true;
      });
    });

    // The panel holds the whole project — a couple of megabytes that most
    // visitors never open. `loading="lazy"` alone wouldn't save them: the
    // panel is only hidden, not out of the document, so the fetches would
    // still fire on scrolling past. Holding the src back until the first
    // hover is what actually makes it free. The lazy attribute still earns
    // its place afterwards, staggering the rest against the strip's scroll.
    let armed = false;
    const load = () => {
      if (armed) return;
      armed = true;
      shots.forEach((img) => {
        if (img.dataset.src) img.src = img.dataset.src;
      });
    };

    group.addEventListener('pointerenter', load);
    group.addEventListener('focusin', load);

    // Escape closes the panel the same way it closes any transient layer. The
    // panel is tied to focus, so surrendering focus is what actually shuts it.
    group.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const tile = group.querySelector('.work-tile');
      if (tile && group.contains(document.activeElement)) {
        e.stopPropagation();
        tile.blur();
      }
    });
  });
})();
