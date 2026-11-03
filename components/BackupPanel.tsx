import { useRef, useState, type ChangeEvent } from 'react';
import { boardItem } from '@/lib/board';
import { BACKUP_FILE_NAME, BackupError, exportBackup, parseBackup } from '@/lib/board-io';
import { saveStatuses } from '@/lib/statuses';
import { relinkOpenTabs } from '@/lib/tracker';
import type { Board, Status } from '@/lib/types';

interface BackupPanelProps {
  board: Board;
  statuses: readonly Status[];
}

type Message = { kind: 'ok' | 'error'; text: string } | null;

/**
 * Export the statuses and the board to a JSON file, and import one back. An
 * import replaces both only after the whole file is valid; its tabs come back
 * as closed links and relink to open tabs with the same URL.
 */
export function BackupPanel({ board, statuses }: BackupPanelProps) {
  const [message, setMessage] = useState<Message>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = () => {
    const blob = new Blob([exportBackup(board, statuses)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = BACKUP_FILE_NAME;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: `Exported ${board.items.length} tabs and ${statuses.length} statuses.` });
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      await boardItem.setValue(backup.board);
      await saveStatuses(backup.statuses);
      await relinkOpenTabs();
      setMessage({
        kind: 'ok',
        text: `Imported ${backup.board.items.length} tabs and ${backup.statuses.length} statuses.`,
      });
    } catch (error) {
      if (!(error instanceof BackupError)) console.warn('Tabstage: could not import', error);
      setMessage({
        kind: 'error',
        text: error instanceof BackupError ? error.message : 'Could not import the file.',
      });
    }
  };

  return (
    <section className="options__section" aria-labelledby="backup-title">
      <h2 id="backup-title">Backup</h2>
      <p className="options__intro">
        Save your statuses and tabs to a JSON file, or restore them. Importing replaces the current
        board.
      </p>
      <div className="options__actions">
        <button type="button" className="button" onClick={download}>
          Export board
        </button>
        <button type="button" className="button" onClick={() => fileRef.current?.click()}>
          Import board…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          hidden
          onChange={(event) => void upload(event)}
        />
      </div>
      {message && (
        <p className={`options__note options__note--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
