import { useCallback, useMemo, useState } from 'react';
import { browser } from '#imports';
import { AddTabsSheet } from '@/components/AddTabsSheet';
import { groupDomId } from '@/components/BoardGroup';
import { ContextMenu } from '@/components/ContextMenu';
import { DeleteStatusDialog } from '@/components/DeleteStatusDialog';
import { FilterInput } from '@/components/FilterInput';
import { PaletteLayer } from '@/components/PaletteLayer';
import { StatusTile, type TileHandlers } from '@/components/StatusTile';
import { useBoard } from '@/hooks/useBoard';
import { usePaletteRequest } from '@/hooks/usePaletteRequest';
import { useStatuses } from '@/hooks/useStatuses';
import * as actions from '@/lib/actions';
import { countInStatus, type DeleteStatusChoice } from '@/lib/board';
import type { PaletteAction } from '@/lib/palette';
import { groupMenu, itemMenu, statusMenu, type MenuHandlers, type MenuItem } from '@/lib/panel-menus';
import type { StatusError } from '@/lib/statuses';
import { buildTiles } from '@/lib/tiles';
import type { Destination, Status } from '@/lib/types';

interface OpenMenu {
  label: string;
  items: MenuItem[];
  x: number;
  y: number;
}

type Renaming = { kind: 'status' | 'group'; id: string } | null;

/** Focuses an element once React has rendered it. */
function focusSoon(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

/**
 * The side panel (Chrome) or sidebar (Firefox): one tile per status with the
 * tabs the user added, as loose tabs and groups. Tabs that were not added
 * and native tab groups are not shown.
 */
function App() {
  const statuses = useStatuses();
  const board = useBoard();
  const [filter, setFilter] = useState('');
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Renaming>(null);
  const [statusErrors, setStatusErrors] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [adding, setAdding] = useState<Destination | null>(null);
  const [deleting, setDeleting] = useState<Status | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [error, setError] = useState<string>();

  const openPalette = useCallback(() => {
    setMenu(null);
    setPaletteOpen(true);
  }, []);
  usePaletteRequest(openPalette);

  const tiles = useMemo(
    () => (statuses && board ? buildTiles(board, statuses, filter) : []),
    [board, statuses, filter],
  );

  const attempt = (work: Promise<unknown>) => {
    setError(undefined);
    work.catch((reason: unknown) => {
      console.warn('Tabstage: could not save the change', reason);
      setError('Could not save the change. Try again.');
    });
  };

  const showErrors = (status: Status) => (errors: StatusError[]) => {
    setStatusErrors((current) => {
      const rest = { ...current };
      delete rest[status.id];
      return errors.length > 0 ? { ...rest, [status.id]: errors[0]!.message } : rest;
    });
  };

  const checked = (status: Status, work: Promise<StatusError[]>) =>
    attempt(work.then(showErrors(status)));

  if (!statuses || !board) {
    return (
      <main className="panel">
        <p className="panel__message">Loading…</p>
      </main>
    );
  }

  const firstStatus = [...statuses].sort((a, b) => a.order - b.order)[0];

  const requestDelete = (status: Status) => {
    if (countInStatus(board, status.id) === 0) {
      checked(status, actions.deleteStatusAndItems(status.id, { remove: true }));
    } else {
      setDeleting(status);
    }
  };

  const menuHandlers: MenuHandlers = {
    newGroupWith: (item) =>
      attempt(
        actions
          .createGroup({ name: 'New group', statusId: item.statusId, itemIds: [item.id] })
          .then((id) => setRenaming({ kind: 'group', id })),
      ),
    moveItem: (item, destination) => attempt(actions.moveItem(item.id, destination)),
    openItem: (item) => attempt(actions.openItem(item)),
    removeItem: (item) => attempt(actions.removeItem(item.id)),
    renameGroup: (group) => setRenaming({ kind: 'group', id: group.id }),
    moveGroup: (group, statusId) => attempt(actions.moveGroup(group.id, statusId)),
    openAll: (group) => attempt(actions.openAll(group.id)),
    clearClosed: (group) => attempt(actions.clearClosed({ groupId: group.id })),
    ungroup: (group) => attempt(actions.ungroup(group.id)),
    removeGroup: (group) => attempt(actions.removeGroup(group.id)),
    renameStatus: (status) => setRenaming({ kind: 'status', id: status.id }),
    recolorStatus: (status, color) => checked(status, actions.setStatusColor(status.id, color)),
    shiftStatus: (status, offset) => checked(status, actions.shiftStatus(status.id, offset)),
    addStatusAfter: (status) => checked(status, actions.addNewStatus({}, status.id)),
    deleteStatus: requestDelete,
  };

  const tileHandlers: TileHandlers = {
    onActivate: (status) => setActiveStatusId(status.id),
    onStartRename: (status) => setRenaming({ kind: 'status', id: status.id }),
    onRename: (status, label) => {
      setRenaming(null);
      checked(status, actions.renameStatusLabel(status.id, label));
    },
    onCancelRename: () => setRenaming(null),
    onStatusMenu: (status, x, y) =>
      setMenu({ label: `Actions for ${status.label}`, items: statusMenu(status, statuses, menuHandlers), x, y }),
    onToggleGroup: (group) => attempt(actions.setGroupCollapsed(group.id, !group.collapsed)),
    onRenameGroup: (group, name) => {
      setRenaming(null);
      attempt(actions.renameGroup(group.id, name));
      focusSoon(groupDomId(group.id));
    },
    onGroupMenu: (group, x, y) =>
      setMenu({ label: `Actions for ${group.name}`, items: groupMenu(group, board, statuses, menuHandlers), x, y }),
    onOpenItem: (item) => attempt(actions.openItem(item)),
    onRemoveItem: (item) => attempt(actions.removeItem(item.id)),
    onItemMenu: (item, x, y) =>
      setMenu({ label: `Actions for ${item.title}`, items: itemMenu(item, board, statuses, menuHandlers), x, y }),
  };

  const runPalette = async (action: PaletteAction): Promise<void> => {
    switch (action.kind) {
      case 'open-item':
        return actions.openItem(action.item);
      case 'show-group':
        if (action.group.collapsed) await actions.setGroupCollapsed(action.group.id, false);
        setFilter('');
        focusSoon(groupDomId(action.group.id));
        return;
      case 'move-item':
        await actions.moveItem(action.item.id, { kind: 'status', statusId: action.status.id });
        return;
      case 'move-group':
        await actions.moveGroup(action.group.id, action.status.id);
        return;
      case 'add-tab': {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('No active tab');
        await actions.addTabs([tab], { kind: 'status', statusId: action.status.id });
      }
    }
  };

  const confirmDelete = (choice: DeleteStatusChoice) => {
    const status = deleting!;
    setDeleting(null);
    checked(status, actions.deleteStatusAndItems(status.id, choice));
  };

  const focusedId = activeStatusId ?? firstStatus?.id;
  const nothingAdded = board.items.length === 0 && board.groups.length === 0;

  return (
    <main className="panel">
      <header className="panel__header">
        <FilterInput value={filter} onChange={setFilter} />
        <button
          type="button"
          className="icon-button panel__palette"
          aria-label="Open command palette"
          title="Command palette (Alt+Shift+K)"
          onClick={openPalette}
        >
          ⌕
        </button>
        <button
          type="button"
          className="icon-button panel__add"
          aria-label="Add tabs"
          title="Add open tabs"
          onClick={() =>
            setAdding({ kind: 'status', statusId: focusedId ?? firstStatus?.id ?? '' })
          }
        >
          +
        </button>
      </header>

      {error && (
        <p className="panel__error" role="alert">
          {error}
        </p>
      )}

      {nothingAdded && (
        <div className="panel__intro">
          <p>
            Only the tabs you add show here. Right-click a page and choose <strong>Tabstage → Add to</strong>,
            or press <strong>+</strong>.
          </p>
          <p className="panel__hint">
            Want the panel on the right? That is a browser setting: see the README.
          </p>
        </div>
      )}

      <div className="tiles">
        {tiles.map((tile) => (
          <StatusTile
            key={tile.status.id}
            tile={tile}
            focused={tile.status.id === focusedId}
            renaming={renaming?.kind === 'status' && renaming.id === tile.status.id}
            renamingGroupId={renaming?.kind === 'group' ? renaming.id : null}
            error={statusErrors[tile.status.id]}
            on={tileHandlers}
          />
        ))}
      </div>

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}

      {adding && (
        <AddTabsSheet
          board={board}
          statuses={statuses}
          initial={adding}
          onClose={() => setAdding(null)}
          onAdd={(tabs, destination) => {
            setAdding(null);
            attempt(actions.addTabs(tabs, destination));
          }}
        />
      )}

      {deleting && (
        <DeleteStatusDialog
          status={deleting}
          count={countInStatus(board, deleting.id)}
          statuses={statuses}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {paletteOpen && (
        <PaletteLayer
          board={board}
          statuses={statuses}
          onRun={runPalette}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </main>
  );
}

export default App;
