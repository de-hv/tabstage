import { Plus, Settings } from 'lucide-react';
import { useState } from 'react';

import type { AccentColor, Group, Snapshot } from '../api/types';
import { defaultBrowser, findBrowser, groupBrowser } from '../lib/browsers';
import { BrowserBadge } from './BrowserBadge';
import { useDrag, useDrop } from './DragDrop';
import { InlineInput } from './InlineInput';

/** New groups take the next accent, so neighbours rarely share a color. */
const GROUP_COLORS: AccentColor[] = ['blue', 'mauve', 'green', 'peach', 'teal', 'pink', 'yellow', 'sky', 'lavender', 'red'];

interface Props {
  snapshot: Snapshot;
  selected: string | null;
  onSelect: (group: string) => void;
  onAddGroup: (name: string, color: AccentColor) => Promise<boolean>;
  settingsOpen: boolean;
  onOpenSettings: () => void;
}

export function Sidebar({ snapshot, selected, onSelect, onAddGroup, settingsOpen, onOpenSettings }: Props) {
  const [adding, setAdding] = useState(false);
  const fallback = defaultBrowser(snapshot);
  const { groups } = snapshot.workspace;

  return (
    <nav className="sidebar" aria-label="Grupos">
      <h2 className="sidebar__title">Grupos</h2>
      <ul className="sidebar__list">
        {groups.map((group) => (
          <li key={group.id}>
            <GroupItem
              snapshot={snapshot}
              group={group}
              current={!settingsOpen && group.id === selected}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="sidebar__form">
          <InlineInput
            label="Nombre del grupo"
            placeholder="Trabajo, Personal…"
            onCancel={() => setAdding(false)}
            onSubmit={async (name) => {
              const color = GROUP_COLORS[groups.length % GROUP_COLORS.length] ?? 'blue';
              const saved = await onAddGroup(name, color);
              if (saved) setAdding(false);
              return saved;
            }}
          />
        </div>
      ) : (
        <button type="button" className="sidebar__item sidebar__new" onClick={() => setAdding(true)}>
          <Plus className="icon" aria-hidden="true" />
          Nuevo grupo
        </button>
      )}
      <div className="sidebar__footer">
        <p className="sidebar__default">
          {fallback && <BrowserBadge name={fallback.name} kind={fallback.kind} />}
          Por defecto: {fallback?.name ?? 'sin navegador'}
        </p>
        <button
          type="button"
          className="sidebar__item"
          aria-current={settingsOpen ? 'page' : undefined}
          onClick={onOpenSettings}
        >
          <Settings className="icon" aria-hidden="true" />
          Ajustes
        </button>
      </div>
    </nav>
  );
}

interface GroupItemProps {
  snapshot: Snapshot;
  group: Group;
  current: boolean;
  onSelect: (group: string) => void;
}

/** A sidebar group: drag to reorder, or drop tabs and folders on it. */
function GroupItem({ snapshot, group, current, onSelect }: GroupItemProps) {
  const drag = useDrag({ kind: 'group', group: group.id });
  const drop = useDrop({ kind: 'group', group: group.id });
  const resolved = groupBrowser(snapshot, group.id);
  const browser = findBrowser(snapshot, resolved?.browser);
  return (
    <button
      type="button"
      className="sidebar__item"
      data-color={group.color}
      aria-current={current ? 'page' : undefined}
      onClick={() => onSelect(group.id)}
      {...drag}
      {...drop}
    >
      <span className="square" />
      <span className="sidebar__name">{group.name}</span>
      {browser && <BrowserBadge name={browser.name} kind={browser.kind} dim={resolved?.followsDefault} />}
    </button>
  );
}
