import * as AlertDialog from '@radix-ui/react-alert-dialog';

export interface PendingDelete {
  name: string;
  /** What goes with it, such as "its 2 sub-tickets and 3 links". */
  contents: string;
  run: () => void;
}

interface Props {
  pending: PendingDelete | null;
  onClose: () => void;
}

/** Confirmation before deleting something that holds sub-tickets or links. */
export function ConfirmDelete({ pending, onClose }: Props) {
  return (
    <AlertDialog.Root open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog__overlay" />
        <AlertDialog.Content className="dialog">
          <AlertDialog.Title className="dialog__title">Delete “{pending?.name}”?</AlertDialog.Title>
          <AlertDialog.Description className="dialog__text">
            This deletes {pending?.contents} too. You can't undo this.
          </AlertDialog.Description>
          <div className="dialog__actions">
            <AlertDialog.Cancel className="button">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
              className="button button--danger"
              onClick={() => {
                pending?.run();
                onClose();
              }}
            >
              Delete
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
