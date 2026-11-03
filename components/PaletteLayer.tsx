import { useId, useMemo, useState } from 'react';
import { useListNavigation } from '@/hooks/useListNavigation';
import { parseCommand, type PaletteAction } from '@/lib/palette';
import type { Board, Status } from '@/lib/types';
import { Dialog } from './Dialog';
import { PaletteInput } from './PaletteInput';
import { optionId, PaletteResults } from './PaletteResults';

interface PaletteLayerProps {
  board: Board;
  statuses: readonly Status[];
  /** Runs a result. A rejection shows an error and keeps the palette open. */
  onRun: (action: PaletteAction) => Promise<void>;
  onClose: () => void;
}

/**
 * The command palette as an overlay inside the panel (`Alt+Shift+K`, or the
 * palette button). Escape closes it and gives focus back.
 */
export function PaletteLayer({ board, statuses, onRun, onClose }: PaletteLayerProps) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const listId = useId();
  const actions = useMemo(() => parseCommand(query, board, statuses), [query, board, statuses]);

  const run = (index: number) => {
    const action = actions[index];
    if (!action) return;
    setError(undefined);
    onRun(action)
      .then(onClose)
      .catch((reason: unknown) => {
        console.warn('Tabstage: could not run the command', reason);
        setError('Could not run the command. Try again.');
      });
  };

  const { index, setIndex, onKeyDown } = useListNavigation({
    count: actions.length,
    resetKey: query,
    onEnter: run,
    onEscape: onClose,
  });
  const selected = actions[index];

  const message = () => {
    if (actions.length > 0) return null;
    if (!query.trim()) return 'Nothing in Tabstage yet. Type “add” to add this tab.';
    return `No results for “${query.trim()}”.`;
  };

  return (
    <Dialog title="Command palette" className="palette" onClose={onClose}>
      <PaletteInput
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        listId={listId}
        activeId={selected && optionId(listId, selected)}
      />
      {error && (
        <p className="palette__error" role="alert">
          {error}
        </p>
      )}
      <PaletteResults id={listId} actions={actions} selected={index} onSelect={setIndex} onRun={run} />
      {message() && <p className="palette__message">{message()}</p>}
      <footer className="palette__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>Enter</kbd> run</span>
        <span><kbd>Esc</kbd> close</span>
      </footer>
    </Dialog>
  );
}
