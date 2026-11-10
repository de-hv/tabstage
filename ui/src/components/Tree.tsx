import type { Node, Place } from '../api/types';
import { DropEnd } from './DragDrop';
import { FolderHeader, type RowContext, TabItem } from './Rows';

interface Props {
  place: Place;
  nodes: Node[];
  row: RowContext;
}

/** List of a group or folder: folders (expandable) and tabs in saved order. */
export function Tree({ place, nodes, row }: Props) {
  return (
    <ul className="tree">
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <li key={node.id}>
            <FolderHeader folder={node} row={row} />
            {!node.collapsed && node.tabs.length > 0 && (
              <ul className="tree__nested">
                {node.tabs.map((tab) => (
                  <li key={tab.id}>
                    <TabItem tab={tab} row={row} />
                  </li>
                ))}
                <li>
                  <DropEnd target={{ kind: 'end', place: { folder: node.id } }} />
                </li>
              </ul>
            )}
          </li>
        ) : (
          <li key={node.id}>
            <TabItem tab={node} row={row} />
          </li>
        ),
      )}
      <li>
        <DropEnd target={{ kind: 'end', place }} />
      </li>
    </ul>
  );
}
