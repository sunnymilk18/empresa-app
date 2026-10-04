import { Fragment } from 'react';

// Texto cuyas letras caen una tras otra (estilos: .fall-letter en styles.css).
// Los lectores de pantalla leen el texto normal; las letras sueltas se ocultan.
export function FallingText({ text }) {
  let offset = 0;
  return (
    <>
      <span className="sr-only">{text}</span>
      {text.split(' ').map((word, w) => {
        const start = offset;
        offset += word.length + 1;
        return (
          <Fragment key={w}>
            {w > 0 && ' '}
            <span className="fall-word" aria-hidden="true">
              {[...word].map((ch, k) => (
                <span key={k} className="fall-letter" style={{ '--i': start + k }}>{ch}</span>
              ))}
            </span>
          </Fragment>
        );
      })}
    </>
  );
}
