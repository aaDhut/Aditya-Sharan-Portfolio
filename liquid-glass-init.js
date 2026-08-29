// Apple-style "liquid glass" effect, powered by @ybouane/liquidglass (WebGL).
// https://github.com/ybouane/liquidglass
//
// This is purely a visual enhancement layered on top of styles.css, which
// already gives the nav bar and buttons a CSS backdrop-filter "frosted glass"
// look on its own. If WebGL is unavailable or the CDN fails to load, the
// site simply keeps that CSS fallback — nothing here is required to render
// the page correctly.

try {
  const { LiquidGlass } = await import(
    'https://cdn.jsdelivr.net/npm/@ybouane/liquidglass@1.0.3/dist/index.js'
  );

  const glassRoot = document.getElementById('glass-root');
  const nav = document.getElementById('glass-nav');
  const heroBtnRoot = document.getElementById('hero-btn-root');
  const primaryBtn = document.getElementById('glass-btn-primary');
  const secondaryBtn = document.getElementById('glass-btn-secondary');

  if (glassRoot && nav) {
    nav.dataset.config = JSON.stringify({
      blurAmount: 0.35,
      refraction: 0.25,
      chromAberration: 0.03,
      edgeHighlight: 0.12,
      specular: 0.25,
      fresnel: 0.6,
      cornerRadius: 0,
      zRadius: 12,
      opacity: 0.9,
      shadowOpacity: 0.08,
      shadowSpread: 6
    });

    const navInstance = await LiquidGlass.init({
      root: glassRoot,
      glassElements: [nav]
    });

    // Scrolling doesn't mutate the DOM, so the library's own change-detection
    // won't know the content under the sticky nav has moved — nudge it.
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        navInstance.markChanged(glassRoot);
        ticking = false;
      });
    }, { passive: true });
  }

  if (heroBtnRoot && primaryBtn && secondaryBtn) {
    const buttonConfig = {
      blurAmount: 0.2,
      refraction: 0.75,
      chromAberration: 0.06,
      edgeHighlight: 0.2,
      specular: 0.45,
      fresnel: 1,
      cornerRadius: 28,
      zRadius: 20,
      shadowOpacity: 0.18,
      shadowSpread: 14,
      button: true
    };
    primaryBtn.dataset.config = JSON.stringify({
      ...buttonConfig,
      tintStrength: 0.15
    });
    secondaryBtn.dataset.config = JSON.stringify(buttonConfig);

    await LiquidGlass.init({
      root: heroBtnRoot,
      glassElements: [primaryBtn, secondaryBtn]
    });
  }
} catch (err) {
  console.warn('Liquid glass effect unavailable, falling back to CSS blur.', err);
}
