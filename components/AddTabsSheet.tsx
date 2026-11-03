import { useEffect, useState } from 'react';
import { browser, type Browser } from '#imports';
import { groupsIn } from '@/lib/board';
import type { Board, Destination, Status } from '@/lib/types';
import { Dialog } from './Dialog';

interface AddTabsSheetProps {
  board: Board;
  statuses: readonly Status[];
  /** Where the tabs go unless the user picks another place. */
  initial: Destination;
  onAdd: (tabs: Browser.tabs.Tab[], destination: Destination) => void;
  onClose: () => void;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; tabs: Browser.tabs.Tab[] };

const encode = (destination: Destination) =>
  destination.kind === 'status' ? `status:${destination.statusId}` : `group:${destination.groupId}`;

function decode(value: string): Destination {
  const at = value.indexOf(':');
  const id = value.slice(at + 1);
  return value.startsWith('group:') ? { kind: 'group', groupId: id } : { kind: 'status', statusId: id };
}

/**
 * The "+" picker: the open tabs of this window that are not in Tabstage yet,
 * with checkboxes, and where to add them (a status or a group).
 */
export function AddTabsSheet({ board, statuses, initial, onAdd, onClose }: AddTabsSheetProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [destination, setDestination] = useState(encode(initial));

  useEffect(() => {
    let active = true;
    const own = browser.runtime.getURL('/');
    browser.tabs
      .query({ currentWindow: true })
      .then((tabs) => {
        if (active) setState({ kind: 'ready', tabs: tabs.filter((tab) => tab.id !== undefined && !tab.url?.startsWith(own)) });
      })
      .catch((error: unknown) => {
        console.warn('Tabstage: could not list the tabs', error);
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  const tracked = new Set(board.items.map((item) => item.tabId));
  const available = state.kind === 'ready' ? state.tabs.filter((tab) => !tracked.has(tab.id!)) : [];
  const chosen = available.filter((tab) => selected.has(tab.id!));
  const ordered = [...statuses].sort((a, b) => a.order - b.order);

  const toggle = (tabId: number) => {
    const next = new Set(selected);
    if (next.has(tabId)) next.delete(tabId);
    else next.add(tabId);
    setSelected(next);
  };

  const renderList = () => {
    if (state.kind === 'loading') return <p className="sheet__message">Loading tabs…</p>;
    if (state.kind === 'error') return <p className="sheet__message" role="alert">Could not list the tabs.</p>;
    if (available.length === 0) return <p className="sheet__message">Every open tab is already in Tabstage.</p>;
    return (
      <ul className="sheet__tabs" aria-label="Open tabs">
        {available.map((tab) => (
          <li key={tab.id}>
            <label className="sheet__tab">
              <input type="checkbox" checked={selected.has(tab.id!)} onChange={() => toggle(tab.id!)} />
              <span className="sheet__tab-title" title={tab.url}>
                {tab.title || tab.url || 'Untitled tab'}
              </span>
            </label>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Dialog title="Add tabs" className="sheet" onClose={onClose}>
      <h2 className="dialog__title">Add tabs</h2>
      {available.length > 1 && (
        <button
          type="button"
          className="button button--small"
          onClick={() =>
            setSelected(chosen.length === available.length ? new Set() : new Set(available.map((tab) => tab.id!)))
          }
        >
          {chosen.length === available.length ? 'Select none' : 'Select all'}
        </button>
      )}
      {renderList()}
      <label className="field">
        <span className="field__label">Add to</span>
        <select value={destination} onChange={(event) => setDestination(event.target.value)}>
          <optgroup label="Statuses">
            {ordered.map((status) => (
              <option key={status.id} value={encode({ kind: 'status', statusId: status.id })}>
                {status.label}
              </option>
            ))}
          </optgroup>
          {board.groups.length > 0 && (
            <optgroup label="Groups">
              {ordered.flatMap((status) =>
                groupsIn(board, status.id).map((group) => (
                  <option key={group.id} value={encode({ kind: 'group', groupId: group.id })}>
                    {group.name} · {status.label}
                  </option>
                )),
              )}
            </optgroup>
          )}
        </select>
      </label>
      <div className="dialog__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={chosen.length === 0}
          onClick={() => onAdd(chosen, decode(destination))}
        >
          {chosen.length === 1 ? 'Add 1 tab' : `Add ${chosen.length} tabs`}
        </button>
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
