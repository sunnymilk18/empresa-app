import { useEffect, useRef } from 'react';

// Colores de estrella: la mayoría blancas, algunas azuladas y otras cálidas.
const TINTS = ['255, 255, 255', '255, 255, 255', '255, 255, 255', '205, 224, 255', '255, 236, 205'];

// Halo suave que se dibuja detrás de las estrellas más brillantes (se crea una vez).
function makeGlow() {
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const g = glow.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.25)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return glow;
}

// Cielo estrellado: estrellas fijas de distinto tamaño y brillo que titilan
// despacio; las más grandes llevan halo y un destello en cruz. Se pausa con la
// pestaña oculta; con "reducir movimiento" se dibuja una sola vez, sin titilar.
export function StarField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const glow = makeGlow();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width, height, stars, raf;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(300, Math.round((width * height) / 6000));
      stars = Array.from({ length: count }, () => {
        const size = Math.random() ** 3; // casi todas chicas, muy pocas grandes
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.4 + size * 1.5,
          base: 0.35 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          speed: 0.008 + Math.random() * 0.02,
          tint: TINTS[Math.floor(Math.random() * TINTS.length)],
          bright: size > 0.35,
        };
      });
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        if (!still) s.phase += s.speed;
        const alpha = Math.min(1, s.base + 0.25 * Math.sin(s.phase) + (s.bright ? 0.2 : 0));
        if (s.bright) {
          ctx.globalAlpha = alpha * 0.5;
          const halo = s.r * 7;
          ctx.drawImage(glow, s.x - halo, s.y - halo, halo * 2, halo * 2);
          // Destello en cruz.
          ctx.globalAlpha = alpha * 0.55;
          ctx.strokeStyle = `rgb(${s.tint})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(s.x - s.r * 4, s.y);
          ctx.lineTo(s.x + s.r * 4, s.y);
          ctx.moveTo(s.x, s.y - s.r * 4);
          ctx.lineTo(s.x, s.y + s.r * 4);
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${s.tint})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(draw);
    }

    function onResize() {
      resize();
      if (still) draw();
    }

    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
