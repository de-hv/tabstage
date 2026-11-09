import type { AppError } from '../api/types';

interface Props {
  error: AppError;
  onReload: () => void;
  onKeepMine: () => void;
  onDismiss: () => void;
}

/** Top banner for errors that are not about a single field. */
export function Banner({ error, onReload, onKeepMine, onDismiss }: Props) {
  if (error.code === 'conflict') {
    return (
      <div className="banner" role="alert">
        <p className="banner__text">
          The data changed on another computer. Load those changes, or save this window's over them.
        </p>
        <button type="button" className="button" onClick={onReload}>
          Load changes
        </button>
        <button type="button" className="button" onClick={onKeepMine}>
          Keep mine
        </button>
      </div>
    );
  }
  return (
    <div className="banner" data-tone="error" role="alert">
      <p className="banner__text">{error.message}</p>
      <button type="button" className="button" onClick={onDismiss}>
        Close
      </button>
    </div>
  );
}
