import type { ContainerColor, Folder, Group, Item, Place, Profile, Tab, Target, Uuid, Workspace } from '../api/types';

/** Where a group, folder or tab sits: its container and its index there. */
export interface Location {
  profile: Profile;
  /** The group that holds it (directly, or through its folder). */
  group?: Group;
  /** The folder that holds it (tabs only). */
  folder?: Folder;
  /** The list it is in. */
  place: Place;
  index: number;
}

/** A tab with what contains it. */
export interface TabRef {
  tab: Tab;
  profile: Profile;
  group?: Group;
  folder?: Folder;
}

export function locate(workspace: Workspace, id: Uuid): Location | null {
  for (const profile of workspace.profiles) {
    for (const [index, item] of profile.items.entries()) {
      if (item.id === id) return { profile, place: { profile: profile.id }, index };
      if (item.type === 'folder') {
        const inFolder = item.tabs.findIndex((tab) => tab.id === id);
        if (inFolder !== -1) return { profile, folder: item, place: { folder: item.id }, index: inFolder };
      }
      if (item.type === 'group') {
        for (const [childIndex, node] of item.children.entries()) {
          if (node.id === id) return { profile, group: item, place: { group: item.id }, index: childIndex };
          if (node.type === 'folder') {
            const inFolder = node.tabs.findIndex((tab) => tab.id === id);
            if (inFolder !== -1) {
              return { profile, group: item, folder: node, place: { folder: node.id }, index: inFolder };
            }
          }
        }
      }
    }
  }
  return null;
}

export function findProfile(workspace: Workspace, id: Uuid): Profile | undefined {
  return workspace.profiles.find((profile) => profile.id === id);
}

/** Every group, profile by profile. */
export function allGroups(workspace: Workspace): Group[] {
  return workspace.profiles.flatMap((profile) =>
    profile.items.flatMap((item) => (item.type === 'group' ? [item] : [])),
  );
}

export function findGroup(workspace: Workspace, id: Uuid): Group | undefined {
  return allGroups(workspace).find((group) => group.id === id);
}

export function findFolder(workspace: Workspace, id: Uuid): Folder | undefined {
  for (const profile of workspace.profiles) {
    for (const item of profile.items) {
      if (item.type === 'folder' && item.id === id) return item;
      if (item.type === 'group') {
        const node = item.children.find((child) => child.id === id);
        if (node?.type === 'folder') return node;
      }
    }
  }
  return undefined;
}

/** Every tab with its containers, in display order. */
export function allTabs(workspace: Workspace): TabRef[] {
  return workspace.profiles.flatMap((profile) =>
    profile.items.flatMap((item): TabRef[] => {
      if (item.type === 'tab') return [{ tab: item, profile }];
      if (item.type === 'folder') return item.tabs.map((tab) => ({ tab, profile, folder: item }));
      return item.children.flatMap((node): TabRef[] =>
        node.type === 'tab'
          ? [{ tab: node, profile, group: item }]
          : node.tabs.map((tab) => ({ tab, profile, group: item, folder: node })),
      );
    }),
  );
}

/** How many tabs something holds, folders and groups included. */
export function countTabs(item: Profile | Item | Group | Folder | Tab): number {
  if ('items' in item) return item.items.reduce((total, child) => total + countTabs(child), 0);
  if ('children' in item) return item.children.reduce((total, node) => total + countTabs(node), 0);
  if ('tabs' in item) return item.tabs.length;
  return 1;
}

/** The list a place stands for, or `null` when it does not exist. */
export function listLength(workspace: Workspace, place: Place): number | null {
  if ('profile' in place) return findProfile(workspace, place.profile)?.items.length ?? null;
  if ('group' in place) return findGroup(workspace, place.group)?.children.length ?? null;
  return findFolder(workspace, place.folder)?.tabs.length ?? null;
}

export function samePlace(a: Place, b: Place): boolean {
  if ('profile' in a) return 'profile' in b && a.profile === b.profile;
  if ('group' in a) return 'group' in b && a.group === b.group;
  return 'folder' in b && a.folder === b.folder;
}

/** "Cliente / In TEST / Sprint" for a place, for menus. */
export function placeLabel(workspace: Workspace, place: Place): string {
  if ('profile' in place) return findProfile(workspace, place.profile)?.name ?? '';
  const id = 'group' in place ? place.group : place.folder;
  const at = locate(workspace, id);
  if (!at) return '';
  const own = 'group' in place ? findGroup(workspace, id)?.name : findFolder(workspace, id)?.name;
  return [at.profile.name, at.group?.id !== id ? at.group?.name : undefined, own].filter(Boolean).join(' / ');
}

/**
 * The color a group or folder shows: its own, its parent's when it chose
 * "parent", else none (`undefined`), which is the default.
 */
export function resolveColor(own: ContainerColor | undefined, parent: number | undefined): number | undefined {
  if (typeof own === 'number') return own;
  return own === 'parent' ? parent : undefined;
}

/**
 * The color an item shows, as a profile color index, or `undefined` for no
 * color. A profile shows its own (its dot); a group or folder the one it
 * chose; a tab, which has none of its own, its group's or folder's. A tab
 * directly in a profile has none.
 */
export function effectiveColor(workspace: Workspace, id: Uuid): number | undefined {
  const profile = findProfile(workspace, id);
  if (profile) return profile.color;
  const at = locate(workspace, id);
  if (!at) return undefined;
  const group = at.group ?? findGroup(workspace, id);
  const folder = at.folder ?? findFolder(workspace, id);
  const groupColor = group ? resolveColor(group.color, at.profile.color) : undefined;
  if (folder) return resolveColor(folder.color, group ? groupColor : at.profile.color);
  return groupColor;
}

/** Whether an item's ticket can open: it has one and its profile has a ticket URL. */
export function hasTicketLink(workspace: Workspace, id: Uuid, ticketId: string | undefined): boolean {
  return Boolean(ticketId && locate(workspace, id)?.profile.ticketUrl);
}

/** The id a target points at. */
export function targetId(target: Target): Uuid {
  return 'group' in target ? target.group : 'folder' in target ? target.folder : target.tab;
}

export function sameTarget(a: Target, b: Target): boolean {
  if ('group' in a) return 'group' in b && a.group === b.group;
  if ('folder' in a) return 'folder' in b && a.folder === b.folder;
  return 'tab' in b && a.tab === b.tab;
}

/** Position of an item in the "Pinned" section, or -1. */
export function pinnedIndex(workspace: Workspace, target: Target): number {
  return (workspace.pinned ?? []).findIndex((pinned) => sameTarget(pinned, target));
}

/** A pinned item with what the sidebar shows of it. */
export type PinnedItem = { target: Target; profile: Profile } & (
  | { kind: 'group'; item: Group }
  | { kind: 'folder'; item: Folder }
  | { kind: 'tab'; item: Tab }
);

/** The pinned items that still exist, in order. */
export function pinnedItems(workspace: Workspace): PinnedItem[] {
  return (workspace.pinned ?? []).flatMap((target): PinnedItem[] => {
    const at = locate(workspace, targetId(target));
    if (!at) return [];
    const { profile } = at;
    if ('group' in target) {
      const item = findGroup(workspace, target.group);
      return item ? [{ target, profile, kind: 'group', item }] : [];
    }
    if ('folder' in target) {
      const item = findFolder(workspace, target.folder);
      return item ? [{ target, profile, kind: 'folder', item }] : [];
    }
    const item = allTabs(workspace).find((ref) => ref.tab.id === target.tab)?.tab;
    return item ? [{ target, profile, kind: 'tab', item }] : [];
  });
}
