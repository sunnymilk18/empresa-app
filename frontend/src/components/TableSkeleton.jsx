// Tabla de relleno mientras llega la primera respuesta: los mismos encabezados
// y unas filas de barras grises, para que el recuadro tenga su forma desde el
// principio y la lista no aparezca de golpe.
export function TableSkeleton({ headers, rows = 6 }) {
  return (
    <div className="table-wrap" aria-busy="true">
      <table className="table">
        <thead>
          <tr>
            {headers.map((h, i) => <th key={i}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              {headers.map((_, j) => <td key={j}><span className="skeleton-bar" /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
