import assetsMd from '../../ASSETS.md?raw';
import { useT } from './i18n';

interface Asset {
  file: string;
  url: string;
  nasaId: string;
  credit: string;
  date: string;
}

/** Reads the "Imágenes en uso" table from ASSETS.md: the credits are generated from that registry. */
function parseAssets(md: string): Asset[] {
  const section = md.split(/^## /m).find((part) => part.startsWith('Imágenes en uso')) ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2) // header and separator
    .map((line) => line.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= 5 && c[0] !== '')
    .map(([file, url, nasaId, credit, date]) => ({ file, url, nasaId, credit, date }));
}

export function Credits({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT();
  const assets = parseAssets(assetsMd);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{t('cr.title')}</h2>
        <p>{t('cr.nasa')}</p>
        {assets.length > 0 ? (
          <ul className="credit-list">
            {assets.map((a) => (
              <li key={a.file}>
                <b>{a.file}</b> · {a.credit}
                {a.nasaId ? ` · ${a.nasaId}` : ''} ·{' '}
                <a href={a.url} target="_blank" rel="noreferrer">
                  {t('cr.origin')}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dim">{t('cr.none')}</p>
        )}
        <p>{t('cr.model')}</p>
        <p className="dim">{t('cr.sources')}</p>
        <p className="dim">{t('cr.font')}</p>
        <button className="tb-btn on" onClick={onClose}>
          {t('cr.close')}
        </button>
      </div>
    </div>
  );
}
