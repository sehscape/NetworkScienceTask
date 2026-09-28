/**
 * liquid-glass.js
 * Tracks the pointer over glass surfaces and exposes its position as
 * --glass-x / --glass-y so CSS can paint a soft specular highlight that
 * follows the cursor. One delegated listener, throttled to animation frames.
 */
export function initLiquidGlass(selector = '.glass') {
  if (typeof window === 'undefined') return () => {};
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  let frame = 0;
  let lastEvent = null;
  let active = null;

  const update = () => {
    frame = 0;
    const e = lastEvent;
    if (!e) return;

    const target = e.target instanceof Element ? e.target.closest(selector) : null;
    if (active && active !== target) active.style.removeProperty('--glass-on');
    active = target;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    target.style.setProperty('--glass-x', `${e.clientX - rect.left}px`);
    target.style.setProperty('--glass-y', `${e.clientY - rect.top}px`);
    target.style.setProperty('--glass-on', '1');
  };

  const onMove = (e) => {
    lastEvent = e;
    if (!frame) frame = requestAnimationFrame(update);
  };

  const onLeave = () => {
    if (active) active.style.removeProperty('--glass-on');
    active = null;
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
  };
}
