import * as AlertDialog from '@radix-ui/react-alert-dialog';

export interface PendingDelete {
  name: string;
  tabCount: number;
  run: () => void;
}

interface Props {
  pending: PendingDelete | null;
  onClose: () => void;
}

/** Confirmation before deleting something that holds tabs. */
export function ConfirmDelete({ pending, onClose }: Props) {
  return (
    <AlertDialog.Root open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog__overlay" />
        <AlertDialog.Content className="dialog">
          <AlertDialog.Title className="dialog__title">¿Eliminar «{pending?.name}»?</AlertDialog.Title>
          <AlertDialog.Description className="dialog__text">
            Se eliminarán sus {pending?.tabCount} tabs. No se puede deshacer.
          </AlertDialog.Description>
          <div className="dialog__actions">
            <AlertDialog.Cancel className="button">Cancelar</AlertDialog.Cancel>
            <AlertDialog.Action
              className="button button--danger"
              onClick={() => {
                pending?.run();
                onClose();
              }}
            >
              Eliminar
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
