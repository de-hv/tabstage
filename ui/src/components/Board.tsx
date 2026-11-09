import type { Group, Status } from '../api/types';
import { type Tile as TileData, groupByStatus } from '../lib/board';
import { useDrop } from './DragDrop';
import { FolderHeader, type RowActions, TabItem } from './Rows';

interface Props {
  group: Group;
  actions: RowActions;
}

/** "By status" view: one tile per status, like the extension's board. */
export function Board({ group, actions }: Props) {
  const tiles = groupByStatus(group, actions.statuses);

  return (
    <div className="tiles">
      {tiles.map((tile) => (
        <Tile key={tile.status?.id ?? 'none'} tile={tile} actions={actions} />
      ))}
    </div>
  );
}

function Tile({ tile, actions }: { tile: TileData; actions: RowActions }) {
  const status: Status | null = tile.status;
  const drop = useDrop({ kind: 'tile', status: status?.id ?? null });
  const label = status?.label ?? 'No status';
  const count = tile.items.reduce(
    (total, item) => total + (item.kind === 'folder' ? item.folder.tabs.length : 1),
    0,
  );
  return (
    <section className="tile" aria-label={label} data-empty={count === 0 || undefined} {...drop}>
      <header className="tile__header" data-color={status?.color}>
        <span className="square" />
        <h2 className="tile__label">{label}</h2>
        <span className="row__count">{count}</span>
      </header>
      {count === 0 ? (
        <p className="tile__empty">No tabs</p>
      ) : (
        <ul className="tree">
          {tile.items.map((item) =>
            item.kind === 'folder' ? (
              <li key={item.folder.id}>
                <FolderHeader folder={item.folder} status={undefined} toggle={false} actions={actions} />
                <ul className="tree__nested">
                  {item.folder.tabs.map((tab) => (
                    <li key={tab.id}>
                      <TabItem tab={tab} status={undefined} actions={actions} />
                    </li>
                  ))}
                </ul>
              </li>
            ) : (
              <li key={item.tab.id}>
                <TabItem tab={item.tab} status={undefined} prefix={item.folder?.name} actions={actions} />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
