import { SkyLife } from './SkyLife';

// Cielo del amanecer (lo monta DawnBackdrop cuando el login sale bien): fondo
// azul con la vida del cielo (SkyLife) y un sol (.sky-sun) que arranca justo
// donde se pone el de CityScene y sube por el cielo. Estilos: .auth-sky y
// .sky-sun en styles.css.
export function SkyOpening() {
  return (
    <div className="auth-sky" aria-hidden="true">
      <div className="sky-sun" />
      <SkyLife />
    </div>
  );
}
