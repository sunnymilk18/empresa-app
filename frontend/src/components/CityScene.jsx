// Ilustración animada del login: atardecer sobre Alto Hospicio, con cerros,
// la ciudad (ventanas que se encienden) y cóndores planeando. Todo es SVG +
// CSS (.scene-* en styles.css); sin imágenes ni librerías. Abarca todo el ancho
// del panel (las colinas son una sola curva continua a lo largo de 800), pero en reposo solo se ve la mitad izquierda (clip-path en CSS).
// Con `rising` el sol sube, el cielo se aclara y el paisaje se descubre completo
// (lo usa el login al entrar bien). Con `still` no se anima nada (sin cóndores,
// ni sol, ni ventanas que titilen): es la versión de fondo de AppSky.

// Silueta del cóndor con las alas abiertas (la usa también SkyOpening).
export const CONDOR_PATH = 'M-24 3 Q-13 -5 -4 0 Q-2 -3 0 -2 Q2 -3 4 0 Q13 -5 24 3 Q13 0 4 3 L0 7 L-4 3 Q-13 0 -24 3Z';

// Ciudad repartida por todo el ancho: [x, ancho, alto] de cada edificio, todos
// apoyados en y = 210. Son siempre los mismos (ruido determinista, sin azar real):
// torres más altas a la izquierda y centro, casas bajas hacia la derecha, y un
// hueco libre donde se pone el sol.
const noise = (n) => {
  const v = Math.sin(n * 127.1) * 43758.5453;
  return v - Math.floor(v);
};
const BUILDINGS = [];
for (let x = 14, i = 1; x < 780; i++) {
  if (x > 390 && x < 510) x = 510;
  const w = 9 + Math.floor(noise(i) * 14);
  const tall = Math.max(0, 1 - Math.abs(x - 260) / 300);
  BUILDINGS.push([x, w, 12 + Math.floor(noise(i + 50) * (12 + 28 * tall))]);
  x += w + (noise(i + 99) < 0.2 + x / 1600 ? 4 + Math.floor(noise(i + 7) * 14) : 1);
}

// Ventanas: una de cada tres (siempre las mismas) y cada una titila a su ritmo.
const WINDOWS = BUILDINGS.flatMap(([x, w, h], b) => {
  const out = [];
  for (let r = 0; r < Math.floor((h - 6) / 8); r++) {
    for (let c = 0; c < Math.floor((w - 4) / 6); c++) {
      if ((b * 7 + r * 3 + c * 5) % 3 === 0) {
        out.push({ key: `${b}-${r}-${c}`, x: x + 3 + c * 6, y: 210 - h + 4 + r * 8, delay: ((b + r + c) % 5) * 0.9 });
      }
    }
  }
  return out;
});

// y, escala, duración (s) y desfase (s, negativo = ya va a mitad de camino).
const CONDORS = [
  { y: 136, scale: 1.2, dur: 38, delay: -12 },
  { y: 146, scale: 0.8, dur: 52, delay: -34 },
  { y: 128, scale: 0.6, dur: 64, delay: -50 },
];

export function CityScene({ rising, still }) {
  return (
    <div className={`auth-scene${rising ? ' is-rising' : ''}${still ? ' is-still' : ''}`} aria-hidden="true">
      <svg className="scene-back" viewBox="0 0 800 240" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3888d8" stopOpacity="0" />
            <stop offset="0.38" stopColor="#3888d8" stopOpacity="0.55" />
            <stop offset="0.62" stopColor="#7db3e0" stopOpacity="0.65" />
            <stop offset="0.85" stopColor="#f8d808" stopOpacity="0.85" />
            <stop offset="1" stopColor="#f8b818" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id="scene-glow">
            <stop offset="0" stopColor="#f8d808" stopOpacity="0.85" />
            <stop offset="1" stopColor="#f8b818" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect className="scene-sky" width="800" height="240" fill="url(#scene-sky)" />
        <g className="scene-sun">
          <circle className="scene-glow" cx="440" cy="176" r="95" fill="url(#scene-glow)" />
          <circle cx="440" cy="176" r="24" fill="#f8d808" />
        </g>

        <path className="scene-hill-far" d="M0 176 Q60 142 120 166 T230 168 T330 148 T420 176 T520 160 T630 138 T740 160 T800 156 V240 H0Z" fill="#785818" />
        <path className="scene-hill-mid" d="M0 202 Q80 170 170 196 T330 190 T470 204 T610 184 T800 180 V240 H0Z" fill="#583808" />

        <g className="scene-city" fill="#2e1d06">
          {BUILDINGS.map(([x, w, h]) => (
            <g key={x}>
              <rect x={x} y={210 - h} width={w} height={h} />
              {h <= 20 && <path d={`M${x - 1} ${210 - h} L${x + w / 2} ${204 - h} L${x + w + 1} ${210 - h}Z`} />}
            </g>
          ))}
        </g>
        <g fill="#f8d808">
          {WINDOWS.map((win) => (
            <rect key={win.key} className="scene-window" x={win.x} y={win.y} width="3" height="4" style={{ animationDelay: `${win.delay}s` }} />
          ))}
        </g>

        <path className="scene-ground-teal" d="M0 214 Q100 201 200 212 T400 208 T600 214 T800 207 V240 H0Z" fill="#08a888" />
        <path className="scene-ground" d="M0 223 Q100 210 200 221 T400 217 T600 223 T800 216 V240 H0Z" fill="#0b1334" />
      </svg>
      {/* Aparte del resto: el desvanecido del borde superior no debe apagarlos al subir. */}
      <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice">
        {CONDORS.map((c) => (
          <g key={c.y} transform={`translate(180 ${c.y})`}>
            <g className="scene-condor" style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>
              <g transform={`scale(${c.scale})`}>
                <path className="scene-wings" fill="#1b1206" d={CONDOR_PATH} />
              </g>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
