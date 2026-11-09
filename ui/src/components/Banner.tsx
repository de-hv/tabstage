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
          Los datos cambiaron en otro equipo. Carga esos cambios o guarda los de esta ventana encima.
        </p>
        <button type="button" className="button" onClick={onReload}>
          Cargar cambios
        </button>
        <button type="button" className="button" onClick={onKeepMine}>
          Mantener los míos
        </button>
      </div>
    );
  }
  return (
    <div className="banner" data-tone="error" role="alert">
      <p className="banner__text">{error.message}</p>
      <button type="button" className="button" onClick={onDismiss}>
        Cerrar
      </button>
    </div>
  );
}
