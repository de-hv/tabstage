import { ExternalLink, FolderPlus, Globe, Layers } from 'lucide-react';
import { useState } from 'react';

import type { AppError, Command, Group, Node, Place, Profile, Snapshot } from '../api/types';
import { profileOpensIn } from '../lib/browsers';
import { nextGroupColor } from '../lib/colors';
import { countTabs } from '../lib/workspace';
import type { ItemActions, Selection } from '../state/selection';
import { useDrag, useDrop } from './DragDrop';
import { InlineInput } from './InlineInput';
import { ItemIcon } from './ItemIcon';
import { ProfileDot } from './ProfileDot';
import { hostOf } from './Rows';
import { SetupNote } from './SetupNote';


interface Props {
  snapshot: Snapshot;
  profile: Profile;
  apply: (command: Command) => Promise<AppError | null>;
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
}

/**
 * A profile as a board: one column per group, plus one for what sits
 * directly in the profile. Dragging a card to a column moves it there, so
 * groups can work as statuses ("In progress", "In TEST", "Done").
 */
export function ProfileBoard({ snapshot, profile, apply, actions, onSelect }: Props) {
  const [adding, setAdding] = useState<'group' | 'folder' | null>(null);
  const loose = profile.items.filter((item): item is Node => item.type !== 'group');
  const groups = profile.items.filter((item): item is { type: 'group' } & Group => item.type === 'group');
  const place: Place = { profile: profile.id };
  const tabCount = countTabs(profile);

  return (
    <main className="board-view" aria-labelledby="view-title">
      <header className="group__header">
        <ProfileDot color={profile.color} />
        <h1 id="view-title" className="group__name">
          {profile.name}
        </h1>
        <span className="group__meta">
          {tabCount} {tabCount === 1 ? 'tab' : 'tabs'} · opens in {profileOpensIn(snapshot, profile.id)}
        </span>
        <div className="group__actions">
          <button type="button" className="button" onClick={() => setAdding('group')}>
            <Layers className="icon" aria-hidden="true" />
            New group
          </button>
          <button type="button" className="button" onClick={() => setAdding('folder')}>
            <FolderPlus className="icon" aria-hidden="true" />
            New folder
          </button>
          <button type="button" className="button" onClick={() => actions.newTab(place)}>
            <Globe className="icon" aria-hidden="true" />
            New tab
          </button>
          <button type="button" className="button" onClick={() => actions.open({ profile: profile.id })}>
            <ExternalLink className="icon" aria-hidden="true" />
            Open all
          </button>
        </div>
      </header>

      <SetupNote snapshot={snapshot} profile={profile} onConfigure={() => actions.configureProfile(profile.id)} />

      {adding && (
        <InlineInput
          label={adding === 'group' ? 'Group name' : 'Folder name'}
          placeholder={adding === 'group' ? 'In TEST, Done…' : 'Sprint, Docs…'}
          onCancel={() => setAdding(null)}
          onSubmit={async (name) => {
            const command: Command =
              adding === 'group'
                ? {
                    type: 'addGroup',
                    profile: profile.id,
                    name,
                    color: nextGroupColor(snapshot.workspace),
                  }
                : { type: 'addFolder', place, name };
            const failure = await apply(command);
            if (!failure) setAdding(null);
            return !failure;
          }}
        />
      )}

      <div className="board" role="list" aria-label={`Board of ${profile.name}`}>
        <Column
          title={`Loose in ${profile.name}`}
          place={place}
          nodes={loose}
          actions={actions}
          onSelect={onSelect}
        />
        {groups.map((group) => (
          <Column key={group.id} group={group} title={group.name} place={{ group: group.id }} nodes={group.children} actions={actions} onSelect={onSelect} />
        ))}
      </div>
    </main>
  );
}

interface ColumnProps {
  title: string;
  group?: Group;
  place: Place;
  nodes: Node[];
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
}

function Column({ title, group, place, nodes, actions, onSelect }: ColumnProps) {
  const drop = useDrop((item) => (item.kind === 'tab' || item.kind === 'folder' ? { kind: 'end', place } : null));
  const count = nodes.reduce((total, node) => total + countTabs(node), 0);
  return (
    <section className="column" role="listitem" aria-label={title} data-loose={!group || undefined} {...drop}>
      {group ? (
        <GroupHeader group={group} count={count} onSelect={onSelect} />
      ) : (
        <header className="column__header">
          <span className="column__title column__title--muted">
            <span className="column__name">{title}</span>
          </span>
          <span className="row__count">{count}</span>
        </header>
      )}
      <ul className="column__cards">
        {nodes.map((node) => (
          <li key={node.id}>
            <Card node={node} actions={actions} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      {nodes.length === 0 && <p className="column__empty">Drop tabs or folders here</p>}
    </section>
  );
}

/** A column's group: click to open it as a list, drag to reorder columns. */
function GroupHeader({ group, count, onSelect }: { group: Group; count: number; onSelect: (selection: Selection) => void }) {
  const drag = useDrag({ kind: 'group', group: group.id });
  const drop = useDrop((item) => (item.kind === 'group' ? { kind: 'before', node: group.id } : null));
  return (
    <header className="column__header" {...drag} {...drop}>
      <button type="button" className="column__title" onClick={() => onSelect({ kind: 'group', id: group.id })}>
        <ItemIcon icon={group.icon} kind="group" />
        <span className="column__name">{group.name}</span>
      </button>
      <span className="row__count">{count}</span>
    </header>
  );
}

function Card({ node, actions, onSelect }: { node: Node; actions: ItemActions; onSelect: (selection: Selection) => void }) {
  const drag = useDrag(node.type === 'tab' ? { kind: 'tab', tab: node.id } : { kind: 'folder', folder: node.id });
  const drop = useDrop((item) =>
    node.type === 'folder' && item.kind === 'tab'
      ? { kind: 'into', place: { folder: node.id } }
      : { kind: 'before', node: node.id },
  );
  if (node.type === 'folder') {
    return (
      <button
        type="button"
        className="card"
        title={`Show ${node.name}`}
        onClick={() => onSelect({ kind: 'folder', id: node.id })}
        {...drag}
        {...drop}
      >
        <ItemIcon icon={node.icon} kind="folder" />
        <span className="card__title">{node.name}</span>
        <span className="row__count">{node.tabs.length}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="card"
      title={node.url}
      onClick={() => actions.open({ tab: node.id })}
      {...drag}
      {...drop}
    >
      <ItemIcon icon={node.icon} kind="tab" />
      <span className="card__title">
        {node.title}
        <span className="card__host">{hostOf(node.url)}</span>
      </span>
    </button>
  );
}
