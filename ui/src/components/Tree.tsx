import type { Node } from '../api/types';
import { DropEnd } from './DragDrop';
import { FolderHeader, type RowActions, TabItem, findStatus } from './Rows';

interface Props {
  group: string;
  nodes: Node[];
  actions: RowActions;
}

/** List view: folders and loose tabs in saved order. */
export function Tree({ group, nodes, actions }: Props) {
  const status = (id: string | undefined) => findStatus(actions.statuses, id);

  return (
    <ul className="tree">
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <li key={node.id}>
            <FolderHeader folder={node} status={status(node.status)} toggle actions={actions} />
            {!node.collapsed && node.tabs.length > 0 && (
              <ul className="tree__nested">
                {node.tabs.map((tab) => (
                  <li key={tab.id}>
                    <TabItem tab={tab} status={node.status ? undefined : status(tab.status)} actions={actions} />
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
            <TabItem tab={node} status={status(node.status)} actions={actions} />
          </li>
        ),
      )}
      <li>
        <DropEnd target={{ kind: 'end', place: { group } }} />
      </li>
    </ul>
  );
}
