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
      blur: 4,
      saturate: 1.7,
      fallbackBlur: 12
    });
  }
}

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
