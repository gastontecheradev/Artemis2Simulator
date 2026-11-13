import assetsMd from '../../ASSETS.md?raw';

interface Asset {
  file: string;
  url: string;
  nasaId: string;
  credit: string;
  date: string;
}

/** Lee la tabla "Imágenes en uso" de ASSETS.md: los créditos se generan desde ese registro. */
function parseAssets(md: string): Asset[] {
  const section = md.split(/^## /m).find((part) => part.startsWith('Imágenes en uso')) ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2) // encabezado y separador
    .map((line) => line.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= 5 && c[0] !== '')
    .map(([file, url, nasaId, credit, date]) => ({ file, url, nasaId, credit, date }));
}

export function Credits({ onClose }: { onClose: () => void }): JSX.Element {
  const assets = parseAssets(assetsMd);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>CRÉDITOS</h2>
        <p>Imágenes cortesía de NASA. Este proyecto no está afiliado ni avalado por NASA.</p>
        {assets.length > 0 ? (
          <ul className="credit-list">
            {assets.map((a) => (
              <li key={a.file}>
                <b>{a.file}</b> · {a.credit}
                {a.nasaId ? ` · ${a.nasaId}` : ''} ·{' '}
                <a href={a.url} target="_blank" rel="noreferrer">
                  origen
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dim">Todavía no hay imágenes de NASA incorporadas a la app. La Tierra y la Luna se dibujan con colores lisos.</p>
        )}
        <p>
          Simulador educativo: la trayectoria se calcula con un modelo simplificado (problema restringido de tres cuerpos circular,
          encendidos impulsivos) y no reproduce los datos reales de vuelo.
        </p>
        <p className="dim">Tipografía IBM Plex Mono (SIL Open Font License). Gráficos con Three.js (MIT).</p>
        <button className="tb-btn on" onClick={onClose}>
          CERRAR
        </button>
      </div>
    </div>
  );
}
