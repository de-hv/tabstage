import * as Popover from '@radix-ui/react-popover';
import { PanelLeftOpen, Search, Settings } from 'lucide-react';
import { type CSSProperties, useState } from 'react';

import type { Item, Node, Workspace } from '../api/types';
import { profileColor } from '../lib/profileColors';
import { effectiveColor, pinnedItems } from '../lib/workspace';
import type { Selection } from '../state/selection';
import { ItemIcon } from './ItemIcon';
import { openPalette } from './Palette';
import { ProfileDot } from './ProfileDot';

interface Props {
  workspace: Workspace;
  selection: Selection | null;
  settingsOpen: boolean;
  onSelect: (selection: Selection) => void;
  onOpenSettings: () => void;
  onExpand: () => void;
  /** Opens a pinned tab in its browser. */
  onOpenTab: (tab: string) => void;
}

/** Style that colors a rail icon with an item's color. */
function colored(workspace: Workspace, id: string): CSSProperties | undefined {
  const color = effectiveColor(workspace, id);
  return color === undefined ? undefined : ({ '--own': profileColor(color) } as CSSProperties);
}

/** The collapsed sidebar: a narrow column of icons with the names as tooltips. */
export function SidebarRail({ workspace, selection, settingsOpen, onSelect, onOpenSettings, onExpand, onOpenTab }: Props) {
  const pinned = pinnedItems(workspace);
  const isCurrent = (kind: Selection['kind'], id: string) =>
    !settingsOpen && selection?.kind === kind && selection.id === id;

  return (
    <nav className="sidebar sidebar--rail" aria-label="Library">
      <div className="sidebar__header">
        <button type="button" className="icon-button" aria-label="Expand sidebar" title="Expand sidebar (⌘\)" onClick={onExpand}>
          <PanelLeftOpen className="icon" aria-hidden="true" />
        </button>
      </div>
      <div className="sidebar__scroll rail">
        <button type="button" className="rail__button" aria-label="Search" title="Search (⌘K)" onClick={openPalette}>
          <Search className="icon" aria-hidden="true" />
        </button>
        {pinned.length > 0 && (
          <div className="rail__profile" role="group" aria-label="Pinned">
            {pinned.map((entry) => {
              const name = entry.kind === 'tab' ? entry.item.title : entry.item.name;
              return (
                <button
                  key={`${entry.kind}-${entry.item.id}`}
                  type="button"
                  className="rail__button"
                  data-own
                  style={colored(workspace, entry.item.id)}
                  title={entry.kind === 'tab' ? `Open ${name}` : name}
                  aria-label={`Pinned: ${name}`}
                  onClick={() =>
                    entry.kind === 'tab' ? onOpenTab(entry.item.id) : onSelect({ kind: entry.kind, id: entry.item.id })
                  }
                >
                  <ItemIcon icon={entry.item.icon} kind={entry.kind} />
                </button>
              );
            })}
          </div>
        )}
        {workspace.profiles.map((profile) => (
          <div key={profile.id} className="rail__profile" role="group" aria-label={profile.name}>
            <button
              type="button"
              className="rail__button"
              title={profile.name}
              aria-label={profile.name}
              aria-current={isCurrent('profile', profile.id) ? 'page' : undefined}
              onClick={() => onSelect({ kind: 'profile', id: profile.id })}
            >
              <ProfileDot color={profile.color} />
            </button>
            {profile.items.map((item) => (
              <RailItem key={item.id} item={item} style={colored(workspace, item.id)} isCurrent={isCurrent} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar__footer rail__footer">
        <button
          type="button"
          className="rail__button"
          aria-label="Settings"
          title="Settings"
          aria-current={settingsOpen ? 'page' : undefined}
          onClick={onOpenSettings}
        >
          <Settings className="icon" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

type IsCurrent = (kind: Selection['kind'], id: string) => boolean;

function itemName(item: Item | Node): string {
  return item.type === 'tab' ? item.title : item.name;
}

/** A top-level item: a tab selects; a group or folder opens a flyout of its children. */
interface RailItemProps {
  item: Item;
  /** Colors the icon of a group or folder. */
  style: CSSProperties | undefined;
  isCurrent: IsCurrent;
  onSelect: (selection: Selection) => void;
}

function RailItem({ item, style, isCurrent, onSelect }: RailItemProps) {
  const [open, setOpen] = useState(false);
  const name = itemName(item);

  if (item.type === 'tab') {
    return (
      <button
        type="button"
        className="rail__button"
        title={name}
        aria-label={name}
        aria-current={isCurrent('tab', item.id) ? 'page' : undefined}
        onClick={() => onSelect({ kind: 'tab', id: item.id })}
      >
        <ItemIcon icon={item.icon} kind="tab" />
      </button>
    );
  }

  const children: Node[] = item.type === 'group' ? item.children : item.tabs.map((tab) => ({ type: 'tab', ...tab }));
  const pick = (selection: Selection) => {
    setOpen(false);
    onSelect(selection);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="rail__button rail__button--container"
          data-own
          style={style}
          title={name}
          aria-label={name}
          aria-current={isCurrent(item.type, item.id) ? 'page' : undefined}
        >
          <ItemIcon icon={item.icon} kind={item.type} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="rail-flyout" side="right" align="start" sideOffset={8} aria-label={name}>
          <button type="button" className="rail-flyout__item rail-flyout__head" onClick={() => pick({ kind: item.type, id: item.id })}>
            <ItemIcon icon={item.icon} kind={item.type} />
            <span className="rail-flyout__name">{name}</span>
          </button>
          {children.length === 0 && <p className="rail-flyout__empty">Empty</p>}
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="rail-flyout__item"
              aria-current={isCurrent(child.type, child.id) ? 'page' : undefined}
              onClick={() => pick({ kind: child.type, id: child.id })}
            >
              <ItemIcon icon={child.icon} kind={child.type} />
              <span className="rail-flyout__name">{itemName(child)}</span>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
