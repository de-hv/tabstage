import { PanelLeftOpen, Search, Settings } from 'lucide-react';
import type { CSSProperties } from 'react';

import type { Workspace } from '../api/types';
import { profileColor } from '../lib/profileColors';
import { pinnedItems } from '../lib/workspace';
import type { Selection } from '../state/selection';
import { ItemIcon } from './ItemIcon';
import { openPalette } from './Palette';
import { ProfileDot } from './ProfileDot';
import { Tip } from './Tooltip';

interface Props {
  workspace: Workspace;
  selection: Selection | null;
  settingsOpen: boolean;
  onSelect: (selection: Selection) => void;
  onOpenSettings: () => void;
  onExpand: () => void;
}

/** The collapsed sidebar: pinned items and profiles as icons, with names as tooltips. */
export function SidebarRail({ workspace, selection, settingsOpen, onSelect, onOpenSettings, onExpand }: Props) {
  const pinned = pinnedItems(workspace);
  const isCurrent = (kind: Selection['kind'], id: string) => !settingsOpen && selection?.kind === kind && selection.id === id;

  return (
    <nav className="sidebar sidebar--rail" aria-label="Library">
      <div className="sidebar__header">
        <Tip label="Expand sidebar" keys="⌘\" side="right">
          <button type="button" className="icon-button" aria-label="Expand sidebar" onClick={onExpand}>
            <PanelLeftOpen className="icon" aria-hidden="true" />
          </button>
        </Tip>
      </div>
      <div className="sidebar__scroll rail">
        <Tip label="Search" keys="⌘K" side="right">
          <button type="button" className="rail__button" aria-label="Search" onClick={openPalette}>
            <Search className="icon" aria-hidden="true" />
          </button>
        </Tip>
        {pinned.length > 0 && (
          <div className="rail__group" role="group" aria-label="Pinned">
            {pinned.map((entry) => {
              const lane = entry.kind === 'ticket' ? entry.status?.color : undefined;
              return (
                <Tip key={`${entry.kind}-${entry.item.id}`} label={entry.item.title} side="right">
                  <button
                    type="button"
                    className="rail__button"
                    data-lane={lane !== undefined || undefined}
                    style={lane === undefined ? undefined : ({ '--lane': profileColor(lane) } as CSSProperties)}
                    aria-label={`Pinned: ${entry.item.title}`}
                    aria-current={isCurrent(entry.kind, entry.item.id) ? 'page' : undefined}
                    onClick={() => onSelect({ kind: entry.kind, id: entry.item.id })}
                  >
                    <ItemIcon icon={entry.item.icon} kind={entry.kind === 'ticket' ? (entry.item.kind ?? 'ticket') : 'note'} />
                  </button>
                </Tip>
              );
            })}
          </div>
        )}
        <div className="rail__group" role="group" aria-label="Profiles">
          {workspace.profiles.map((profile) => (
            <Tip key={profile.id} label={profile.name} side="right">
              <button
                type="button"
                className="rail__button"
                aria-label={profile.name}
                aria-current={isCurrent('profile', profile.id) ? 'page' : undefined}
                onClick={() => onSelect({ kind: 'profile', id: profile.id })}
              >
                <ProfileDot color={profile.color} />
              </button>
            </Tip>
          ))}
        </div>
      </div>
      <div className="sidebar__footer rail__footer">
        <Tip label="Settings" side="right">
          <button
            type="button"
            className="rail__button"
            aria-label="Settings"
            aria-current={settingsOpen ? 'page' : undefined}
            onClick={onOpenSettings}
          >
            <Settings className="icon" aria-hidden="true" />
          </button>
        </Tip>
      </div>
    </nav>
  );
}
