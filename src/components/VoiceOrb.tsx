import { useEffect, useRef } from 'react';

interface Levels {
  input: number;
  output: number;
}

interface Props {
  /** Read on every animation frame; kept outside React state on purpose. */
  getLevels: () => Levels;
  state: 'connecting' | 'listening' | 'speaking' | 'muted' | 'reconnecting';
}

const TAU = Math.PI * 2;

/**
 * A soft glass sphere that breathes with the conversation: it swells and
 * ripples in Electric Blue while the assistant talks, and picks up a bright
 * rim when the caller does. Drawn on canvas so it can run at 60fps without
 * re-rendering React.
 */
export function VoiceOrb({ getLevels, state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;
    let t = 0;
    let inLevel = 0;
    let outLevel = 0;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const blob = (cx: number, cy: number, radius: number, amp: number, seed: number) => {
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * TAU;
        const wobble =
          Math.sin(a * 3 + t * 1.4 + seed) * 0.5 +
          Math.sin(a * 5 - t * 1.9 + seed * 2.1) * 0.3 +
          Math.sin(a * 2 + t * 0.8 + seed * 0.7) * 0.2;
        const r = radius * (1 + amp * wobble);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const draw = () => {
      const { input, output } = getLevels();
      const mode = stateRef.current;
      const waiting = mode === 'connecting' || mode === 'reconnecting';

      inLevel += ((mode === 'muted' ? 0 : input) - inLevel) * 0.18;
      outLevel += (output - outLevel) * 0.22;
      t += reduceMotion ? 0.004 : 0.016;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.27;
      const breathe = Math.sin(t * 1.6) * (waiting ? 0.035 : 0.012);
      const energy = Math.max(inLevel * 0.8, outLevel);

      ctx.clearRect(0, 0, w, h);

      // Halo
      const halo = ctx.createRadialGradient(cx, cy, base * 0.6, cx, cy, base * 2.2);
      halo.addColorStop(0, `rgba(36, 36, 255, ${0.1 + outLevel * 0.3})`);
      halo.addColorStop(1, 'rgba(36, 36, 255, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Back layers: slow, translucent
      for (let layer = 2; layer >= 1; layer--) {
        blob(cx, cy, base * (1 + layer * 0.07 + breathe + outLevel * 0.12), 0.03 + energy * 0.16, layer * 1.7);
        ctx.fillStyle = `rgba(36, 36, 255, ${0.08 + outLevel * 0.1})`;
        ctx.fill();
      }

      // Core sphere
      const r = base * (1 + breathe + outLevel * 0.08);
      blob(cx, cy, r, 0.015 + energy * 0.09, 0);
      const core = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.15);
      core.addColorStop(0, `rgba(226, 226, 255, ${0.9 + outLevel * 0.1})`);
      core.addColorStop(0.35, 'rgba(110, 110, 255, 0.96)');
      core.addColorStop(0.8, 'rgba(36, 36, 255, 0.96)');
      core.addColorStop(1, 'rgba(18, 0, 200, 0.96)');
      ctx.fillStyle = core;
      ctx.fill();

      // Caller voice: a bright rim that tightens as they speak
      if (inLevel > 0.02) {
        blob(cx, cy, r * (1.06 + inLevel * 0.1), 0.02 + inLevel * 0.12, 3.3);
        ctx.strokeStyle = `rgba(0, 0, 239, ${Math.min(0.85, inLevel * 1.6)})`;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }

      // Specular highlight for the glass look
      const spec = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.55, 0, cx - r * 0.3, cy - r * 0.55, r * 0.6);
      spec.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.98, 0, TAU);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [getLevels]);

  return <canvas ref={canvasRef} className="orb" aria-hidden="true" />;
}
