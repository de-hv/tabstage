import type { Tile } from '@/lib/tiles';
import type { BoardGroup as Group, BoardItem, Status } from '@/lib/types';
import { BoardGroup } from './BoardGroup';
import { InlineEdit } from './InlineEdit';
import { ItemRow } from './ItemRow';

/** What a tile and its rows can ask the panel to do. */
export interface TileHandlers {
  onActivate: (status: Status) => void;
  onStartRename: (status: Status) => void;
  onRename: (status: Status, label: string) => void;
  onCancelRename: () => void;
  onStatusMenu: (status: Status, x: number, y: number) => void;
  onToggleGroup: (group: Group) => void;
  onRenameGroup: (group: Group, name: string) => void;
  onGroupMenu: (group: Group, x: number, y: number) => void;
  onOpenItem: (item: BoardItem) => void;
  onRemoveItem: (item: BoardItem) => void;
  onItemMenu: (item: BoardItem, x: number, y: number) => void;
}

interface StatusTileProps {
  tile: Tile;
  /** The last tile the user worked in: drawn with the accent border. */
  focused: boolean;
  /** True while the status label is being edited. */
  renaming: boolean;
  /** The group whose name is being edited, if any. */
  renamingGroupId: string | null;
  /** Why the last change to this status was refused. */
  error?: string;
  on: TileHandlers;
}

/**
 * One status as a tile: color square, label (double-click renames), counter
 * and a "⋯" menu, then its groups and loose tabs. An empty status is drawn
 * compact.
 */
export function StatusTile({ tile, focused, renaming, renamingGroupId, error, on }: StatusTileProps) {
  const { status, groups, items, count, empty } = tile;
  const labelId = `tile-${status.id}-label`;

  return (
    <section
      className="tile"
      data-color={status.color}
      data-focused={focused || undefined}
      data-empty={empty || undefined}
      aria-labelledby={labelId}
      onFocusCapture={() => on.onActivate(status)}
      onPointerDown={() => on.onActivate(status)}
    >
      <header className="tile__header">
        <span className="square" aria-hidden="true" />
        {renaming ? (
          <InlineEdit
            value={status.label}
            label={`Rename ${status.label}`}
            className="tile__rename"
            onCommit={(label) => on.onRename(status, label)}
            onCancel={on.onCancelRename}
          />
        ) : (
          <h2
            id={labelId}
            className="tile__label"
            title="Double-click to rename"
            onDoubleClick={() => on.onStartRename(status)}
          >
            {status.label}
          </h2>
        )}
        <span className="tile__count" aria-label={`${count} tabs`}>
          {count}
        </span>
        <button
          type="button"
          className="icon-button tile__menu"
          aria-label={`Actions for ${status.label}`}
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            on.onStatusMenu(status, rect.left, rect.bottom);
          }}
        >
          ⋯
        </button>
      </header>
      {error && (
        <p className="tile__error" role="alert">
          {error}
        </p>
      )}
      {empty ? (
        <p className="tile__empty">No tabs</p>
      ) : (
        <ul className="tile__list" aria-label={`Tabs in ${status.label}`}>
          {groups.map((view) => (
            <BoardGroup
              key={view.group.id}
              view={view}
              renaming={renamingGroupId === view.group.id}
              onToggle={on.onToggleGroup}
              onRename={on.onRenameGroup}
              onCancelRename={on.onCancelRename}
              onMenu={on.onGroupMenu}
              onOpenItem={on.onOpenItem}
              onRemoveItem={on.onRemoveItem}
              onItemMenu={on.onItemMenu}
            />
          ))}
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onOpen={on.onOpenItem}
              onRemove={on.onRemoveItem}
              onMenu={on.onItemMenu}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
