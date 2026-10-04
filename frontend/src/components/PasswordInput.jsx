import { useState } from 'react';

// Campo de contraseña con el ojo para verla (sin el candado del login).
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <span className="field-box field-box--plain">
      <input {...props} type={show ? 'text' : 'password'} />
      <button
        type="button"
        className="field-eye"
        onClick={() => setShow(!show)}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
