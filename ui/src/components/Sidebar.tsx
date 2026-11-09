import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Globe,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Settings,
  SquarePlus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import type { AccentColor, AppError, Command, Group, Profile, Snapshot } from '../api/types';
import { groupsOf, profileView } from '../lib/browsers';
import { useDrag, useDrop } from './DragDrop';
import { InlineInput } from './InlineInput';
import { ProfileColorButton } from './ProfileDot';
import { RemoveProfileDialog } from './ProfilesEditor';

/** New groups take the next accent, so neighbours rarely share a color. */
const GROUP_COLORS: AccentColor[] = ['blue', 'mauve', 'green', 'peach', 'teal', 'pink', 'yellow', 'sky', 'lavender', 'red'];

const COLLAPSED_KEY = 'tabstage.collapsedProfiles';

export type CreateKind = 'folder' | 'tab';

interface Props {
  snapshot: Snapshot;
  selected: string | null;
  settingsOpen: boolean;
  onSelect: (group: string) => void;
  onAddGroup: (profile: string, name: string, color: AccentColor) => Promise<boolean>;
  onAddProfile: (name: string) => Promise<boolean>;
  onCreate: (profile: string, kind: CreateKind) => void;
  onOpenSettings: () => void;
  apply: (command: Command) => Promise<AppError | null>;
}

/** Groups listed under their profile; each profile folds away. */
export function Sidebar(props: Props) {
  const { snapshot, onAddProfile, onOpenSettings, settingsOpen } = props;
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  const [addingProfile, setAddingProfile] = useState(false);

  const toggle = (profile: string) => {
    const next = collapsed.includes(profile)
      ? collapsed.filter((id) => id !== profile)
      : [...collapsed, profile];
    setCollapsed(next);
    saveCollapsed(next);
  };

  return (
    <nav className="sidebar" aria-label="Groups">
      <ul className="sidebar__profiles">
        {snapshot.workspace.profiles.map((profile) => (
          <ProfileSection
            key={profile.id}
            {...props}
            profile={profile}
            expanded={!collapsed.includes(profile.id)}
            onToggle={() => toggle(profile.id)}
          />
        ))}
      </ul>
      {addingProfile ? (
        <div className="sidebar__form">
          <InlineInput
            label="Profile name"
            placeholder="Work, Client X…"
            onCancel={() => setAddingProfile(false)}
            onSubmit={async (name) => {
              const saved = await onAddProfile(name);
              if (saved) setAddingProfile(false);
              return saved;
            }}
          />
        </div>
      ) : (
        <button type="button" className="sidebar__item sidebar__new" onClick={() => setAddingProfile(true)}>
          <Plus className="icon" aria-hidden="true" />
          New profile
        </button>
      )}
      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__item"
          aria-current={settingsOpen ? 'page' : undefined}
          onClick={onOpenSettings}
        >
          <Settings className="icon" aria-hidden="true" />
          Settings
        </button>
      </div>
    </nav>
  );
}

interface SectionProps extends Props {
  profile: Profile;
  expanded: boolean;
  onToggle: () => void;
}

function ProfileSection({
  snapshot,
  profile,
  expanded,
  onToggle,
  selected,
  settingsOpen,
  onSelect,
  onAddGroup,
  onCreate,
  onOpenSettings,
  apply,
}: SectionProps) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const drag = useDrag({ kind: 'profile', profile: profile.id });
  const drop = useDrop({ kind: 'profile', profile: profile.id });
  const groups = groupsOf(snapshot, profile.id);
  const view = profileView(snapshot, profile.id);
  const unconfigured = !view?.isBound || view.isFallback;
  const others = snapshot.workspace.profiles.filter((candidate) => candidate.id !== profile.id);

  return (
    <li className="profile">
      <div className="profile__head" {...drag} {...drop}>
        <button
          type="button"
          className="icon-button profile__chevron"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} profile ${profile.name}`}
          onClick={onToggle}
        >
          {expanded ? (
            <ChevronDown className="icon" aria-hidden="true" />
          ) : (
            <ChevronRight className="icon" aria-hidden="true" />
          )}
        </button>
        <ProfileColorButton
          profile={profile}
          open={colorOpen}
          onOpenChange={setColorOpen}
          onChange={(color) => void apply({ type: 'setProfileColor', profile: profile.id, color })}
        />
        {renaming ? (
          <div className="profile__rename">
            <InlineInput
              label="Profile name"
              initial={profile.name}
              onCancel={() => setRenaming(false)}
              onSubmit={async (name) => {
                const failure = await apply({ type: 'renameProfile', profile: profile.id, name });
                if (!failure) setRenaming(false);
                return !failure;
              }}
            />
          </div>
        ) : (
          // The chevron is the accessible toggle; the name is a larger mouse target.
          <span className="profile__label" onClick={onToggle} aria-hidden="true">
            <span className="sidebar__name profile__name">{profile.name}</span>
            <span className="row__count">{groups.length}</span>
          </span>
        )}
        {unconfigured && (
          <span className="profile__warning" role="img" aria-label={`${profile.name}: not set up on this computer`}>
            <AlertTriangle className="icon" aria-hidden="true" />
          </span>
        )}
        <CreateMenu
          profile={profile}
          hasGroups={groups.length > 0}
          onGroup={() => setAddingGroup(true)}
          onCreate={(kind) => onCreate(profile.id, kind)}
        />
        <ProfileMenu
          profile={profile}
          canDelete={others.length > 0}
          onRename={() => setRenaming(true)}
          onColor={() => setColorOpen(true)}
          onConfigure={onOpenSettings}
          onDelete={() => setRemoving(true)}
        />
      </div>
      {expanded && (
        <ul className="sidebar__list profile__groups" aria-label={`Groups in ${profile.name}`}>
          {groups.map((group) => (
            <li key={group.id}>
              <GroupItem group={group} current={!settingsOpen && group.id === selected} onSelect={onSelect} />
            </li>
          ))}
          {addingGroup && (
            <li className="sidebar__form">
              <InlineInput
                label="Group name"
                placeholder="Jira, Reading…"
                onCancel={() => setAddingGroup(false)}
                onSubmit={async (name) => {
                  const color = GROUP_COLORS[snapshot.workspace.groups.length % GROUP_COLORS.length] ?? 'blue';
                  const saved = await onAddGroup(profile.id, name, color);
                  if (saved) setAddingGroup(false);
                  return saved;
                }}
              />
            </li>
          )}
        </ul>
      )}
      <RemoveProfileDialog
        snapshot={snapshot}
        profile={removing ? profile : null}
        others={others}
        onClose={() => setRemoving(false)}
        onRemove={(moveGroupsTo) => {
          setRemoving(false);
          void apply({ type: 'removeProfile', profile: profile.id, moveGroupsTo });
        }}
      />
    </li>
  );
}

interface CreateMenuProps {
  profile: Profile;
  hasGroups: boolean;
  onGroup: () => void;
  onCreate: (kind: CreateKind) => void;
}

/** "+" next to a profile: create a group, folder or tab inside it. */
function CreateMenu({ profile, hasGroups, onGroup, onCreate }: CreateMenuProps) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className="icon-button profile__add" aria-label={`Create in ${profile.name}`}>
          <Plus className="icon" aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="start" sideOffset={4} onCloseAutoFocus={(event) => event.preventDefault()}>
          <Menu.Label className="menu__label">Create in {profile.name}</Menu.Label>
          <Menu.Item className="menu__item" onSelect={onGroup}>
            <SquarePlus className="icon" aria-hidden="true" />
            New group
          </Menu.Item>
          {hasGroups && (
            <>
              <Menu.Item className="menu__item" onSelect={() => onCreate('folder')}>
                <FolderPlus className="icon" aria-hidden="true" />
                New folder…
              </Menu.Item>
              <Menu.Item className="menu__item" onSelect={() => onCreate('tab')}>
                <Globe className="icon" aria-hidden="true" />
                New tab…
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface ProfileMenuProps {
  profile: Profile;
  canDelete: boolean;
  onRename: () => void;
  onColor: () => void;
  onConfigure: () => void;
  onDelete: () => void;
}

/** "⋯" next to a profile: rename, recolor, configure or delete it. */
function ProfileMenu({ profile, canDelete, onRename, onColor, onConfigure, onDelete }: ProfileMenuProps) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className="icon-button profile__more" aria-label={`Options for profile ${profile.name}`}>
          <MoreHorizontal className="icon" aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="start" sideOffset={4} onCloseAutoFocus={(event) => event.preventDefault()}>
          <Menu.Item className="menu__item" onSelect={onRename}>
            <Pencil className="icon" aria-hidden="true" />
            Rename
          </Menu.Item>
          <Menu.Item className="menu__item" onSelect={onColor}>
            <Palette className="icon" aria-hidden="true" />
            Change color…
          </Menu.Item>
          <Menu.Item className="menu__item" onSelect={onConfigure}>
            <Settings className="icon" aria-hidden="true" />
            Configure profile
          </Menu.Item>
          {canDelete && (
            <>
              <Menu.Separator className="separator" />
              <Menu.Item className="menu__item menu__item--danger" onSelect={onDelete}>
                <Trash2 className="icon" aria-hidden="true" />
                Delete…
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface GroupItemProps {
  group: Group;
  current: boolean;
  onSelect: (group: string) => void;
}

/** A sidebar group: drag to reorder or to another profile; tabs drop on it. */
function GroupItem({ group, current, onSelect }: GroupItemProps) {
  const drag = useDrag({ kind: 'group', group: group.id });
  const drop = useDrop({ kind: 'group', group: group.id });
  return (
    <button
      type="button"
      className="sidebar__item profile__group"
      data-color={group.color}
      aria-current={current ? 'page' : undefined}
      onClick={() => onSelect(group.id)}
      {...drag}
      {...drop}
    >
      <span className="square" />
      <span className="sidebar__name">{group.name}</span>
    </button>
  );
}

function readCollapsed(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveCollapsed(ids: string[]) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable; folding then resets on restart.
  }
}
