import { CONDOR_PATH } from './CityScene';

// La vida del cielo: nubes que entran y luego derivan, cóndores y un avión que
// cruzan una y otra vez. Lo comparten el amanecer (SkyOpening) y el cielo de día
// del panel (AppSky). Estilos y animaciones: .sky-* en styles.css.
//
// Todo queda a media altura o más abajo: en pantallas anchas el cielo se recorta
// por arriba y lo de arriba quedaría pegado (o tapado) por la barra superior.

// x, y, escala, desfase (s) y desde dónde entra (px).
const CLOUDS = [
  { x: 180, y: 230, scale: 1.8, delay: 0.5, from: -260 },
  { x: 540, y: 175, scale: 1.4, delay: 0.8, from: 260 },
  { x: 820, y: 270, scale: 1.7, delay: 1, from: 260 },
  { x: 340, y: 340, scale: 1.2, delay: 1.2, from: -260 },
  { x: 680, y: 400, scale: 1, delay: 1.4, from: 260 },
  { x: 110, y: 420, scale: 1.1, delay: 1.6, from: -260 },
];

// y, escala, duración de un cruce (s) y desfase (s; negativo = ya va a mitad de camino,
// así el cielo nunca arranca vacío).
const CONDORS = [
  { y: 175, scale: 1.7, dur: 30, delay: -6 },
  { y: 240, scale: 1.1, dur: 38, delay: -18 },
  { y: 355, scale: 2.1, dur: 34, delay: -26 },
  { y: 430, scale: 1, dur: 42, delay: -10 },
  { y: 510, scale: 1.4, dur: 36, delay: -30 },
];

export function SkyLife() {
  return (
    <svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id="sky-blur"><feGaussianBlur stdDeviation="0.7" /></filter>
        <linearGradient id="sky-trail">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      {CLOUDS.map((c) => (
        <g key={c.y} transform={`translate(${c.x} ${c.y}) scale(${c.scale})`}>
          <g className="sky-drift" style={{ animationDuration: `${30 + c.delay * 12}s` }}>
            <g className="sky-cloud" filter="url(#sky-blur)" style={{ '--from': `${c.from}px`, animationDelay: `${c.delay}s` }}>
              <path fill="#fff" d="M-48 8 Q-54 -4 -37 -5 Q-35 -19 -17 -17 Q-9 -32 12 -23 Q31 -29 37 -11 Q55 -9 50 8 Z" />
              <path fill="#cfdcf0" opacity="0.65" d="M-47 8 Q0 15 49 8 Q41 2 0 3.5 Q-41 2 -47 8 Z" />
            </g>
          </g>
        </g>
      ))}

      <g transform="translate(0 305) scale(1.3)">
        <g className="sky-plane">
          <rect x="-125" y="-0.6" width="110" height="1.2" fill="url(#sky-trail)" />
          <path fill="#fff" d="M-14 -1.8 H12 Q17 -1.8 18 0 Q17 1.8 12 1.8 H-14 Z" />
          <path fill="#fff" d="M-14 -1.8 L-19 -8 L-12 -8 L-8 -1.8 Z" />
          <path fill="#e3ebf7" d="M-2 1 L6 1 L-4 9 L-8 9 Z" />
        </g>
      </g>

      {CONDORS.map((c) => (
        <g key={c.y} transform={`translate(180 ${c.y})`}>
          <g className="sky-condor" style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
            <g transform={`scale(${c.scale})`}>
              <path className="scene-wings" fill="#0b1334" d={CONDOR_PATH} />
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}
