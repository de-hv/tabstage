import { type CSSProperties, useEffect, useRef, useState } from 'react';

import type { Place, Snapshot } from './api/types';
import { Banner } from './components/Banner';
import { ConfirmDelete, type PendingDelete } from './components/ConfirmDelete';
import { ContainerView } from './components/ContainerView';
import { DataFileDialog } from './components/DataFileDialog';
import { DragProvider } from './components/DragDrop';
import { NewTabDialog } from './components/NewTabDialog';
import { Palette } from './components/Palette';
import { ProfileBoard } from './components/ProfileBoard';
import { RemoveProfileDialog } from './components/ProfilesEditor';
import { ResizeHandle, SIDEBAR_DEFAULT, clampWidth } from './components/ResizeHandle';
import { TabDetail } from './components/TabDetail';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { profileBrowser } from './lib/browsers';
import { countTabs, findFolder, findGroup, findProfile, locate, pinnedIndex, placeLabel } from './lib/workspace';
import type { ItemActions, Selection } from './state/selection';
import { usePreference } from './state/usePreference';
import { useWorkspace } from './state/useWorkspace';

const WIDTH_KEY = 'tabstage.sidebarWidth';

export function App() {
  const workspace = useWorkspace();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusProfile, setFocusProfile] = useState<string | null>(null);
  const [newTabPlace, setNewTabPlace] = useState<Place | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [removingProfile, setRemovingProfile] = useState<string | null>(null);
  const [width, setWidth] = useState(readWidth);
  const [showUrls, setShowUrls] = usePreference('tabstage.sidebarUrls', false);
  const [collapsed, setCollapsed] = usePreference('tabstage.sidebarCollapsed', false);
  const [indentGuides, setIndentGuides] = usePreference('tabstage.indentGuides', true);
  /** "Edit details…" from a menu: the item whose note to start editing. */
  const [noteRequest, setNoteRequest] = useState<{ id: string; at: number } | null>(null);
  const { snapshot, error } = workspace;

  const togglePinRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key === '\\') {
        event.preventDefault();
        setCollapsed(!collapsed);
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        togglePinRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapsed, setCollapsed]);

  if (!snapshot) {
    return error ? (
      <Banner
        error={error}
        onReload={workspace.reload}
        onKeepMine={workspace.keepMine}
        onDismiss={workspace.reload}
      />
    ) : null;
  }

  const { apply } = workspace;
  const shown = resolveSelection(snapshot, selection);
  const select = (next: Selection) => {
    setSelection(next);
    setSettingsOpen(false);
    setNoteRequest(null);
  };

  const actions: ItemActions = {
    open: (target) => {
      if ('tab' in target) {
        const at = locate(snapshot.workspace, target.tab);
        const browser = at ? profileBrowser(snapshot, at.profile.id)?.name : undefined;
        void workspace.openTab(target.tab, browser ?? '');
      } else if ('folder' in target) void workspace.openFolder(target.folder);
      else if ('group' in target) void workspace.openGroup(target.group);
      else void workspace.openProfile(target.profile);
    },
    newTab: setNewTabPlace,
    requestDelete: (target) => {
      if ('profile' in target) {
        setRemovingProfile(target.profile);
        return;
      }
      if ('tab' in target) {
        void apply({ type: 'removeTab', tab: target.tab });
        return;
      }
      const found =
        'group' in target
          ? findGroup(snapshot.workspace, target.group)
          : findFolder(snapshot.workspace, target.folder);
      if (!found) return;
      const isGroup = 'children' in found;
      const run = () =>
        void apply(isGroup ? { type: 'removeGroup', group: found.id } : { type: 'removeFolder', folder: found.id });
      const tabs = countTabs(found);
      if (tabs === 0) run();
      else setPendingDelete({ name: found.name, tabCount: tabs, run });
    },
    setIcon: (target, icon) => void apply({ type: 'setIcon', target, icon }),
    editDetails: (target) => {
      const next: Selection =
        'group' in target
          ? { kind: 'group', id: target.group }
          : 'folder' in target
            ? { kind: 'folder', id: target.folder }
            : { kind: 'tab', id: target.tab };
      setSelection(next);
      setSettingsOpen(false);
      setNoteRequest({ id: next.id, at: Date.now() });
    },
    openTicket: (target) => void workspace.openTicket(target),
    togglePin: (target) =>
      void apply(pinnedIndex(snapshot.workspace, target) === -1 ? { type: 'pin', target } : { type: 'unpin', target }),
    openUrl: (profile, url) => void workspace.openUrl(profile, url),
    configureProfile: (profile) => {
      setFocusProfile(profile);
      setSettingsOpen(true);
    },
  };

  togglePinRef.current = () => {
    if (settingsOpen || !shown || shown.kind === 'profile') return;
    actions.togglePin(shown.kind === 'group' ? { group: shown.id } : shown.kind === 'folder' ? { folder: shown.id } : { tab: shown.id });
  };

  const removing = removingProfile ? findProfile(snapshot.workspace, removingProfile) ?? null : null;

  return (
    <DragProvider workspace={snapshot.workspace} apply={(command) => void apply(command)}>
      <div
        className="app"
        data-collapsed={collapsed || undefined}
        style={{ '--sidebar-width': `${width}px` } as CSSProperties}
      >
        <div className="app__banner">
          {error && (
            <Banner
              error={error}
              onReload={workspace.reload}
              onKeepMine={workspace.keepMine}
              onDismiss={workspace.dismissError}
            />
          )}
        </div>
        <Sidebar
          snapshot={snapshot}
          selection={shown}
          settingsOpen={settingsOpen}
          onSelect={select}
          onOpenSettings={() => {
            setFocusProfile(null);
            setSettingsOpen(true);
          }}
          apply={apply}
          actions={actions}
          showUrls={showUrls}
          onShowUrls={setShowUrls}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          indentGuides={indentGuides}
        />
        {!collapsed && (
          <ResizeHandle
            width={width}
            onResize={(next, done) => {
              setWidth(next);
              if (done) saveWidth(next);
            }}
          />
        )}
        {settingsOpen ? (
          <Settings
            snapshot={snapshot}
            apply={apply}
            inspectDataFolder={workspace.inspectDataFolder}
            relocate={workspace.relocate}
            onRevealDataFile={() => void workspace.revealDataFile()}
            focusProfile={focusProfile}
            showUrls={showUrls}
            onShowUrls={setShowUrls}
            indentGuides={indentGuides}
            onIndentGuides={setIndentGuides}
          />
        ) : (
          <MainView
            snapshot={snapshot}
            shown={shown}
            apply={apply}
            actions={actions}
            onSelect={select}
            notify={workspace.notify}
            noteRequest={noteRequest}
          />
        )}
        <Palette
          snapshot={snapshot}
          openTab={(tab) => actions.open({ tab })}
          openFolder={(folder) => actions.open({ folder })}
          openTicket={actions.openTicket}
        />
        <NewTabDialog
          place={newTabPlace}
          placeName={newTabPlace ? placeLabel(snapshot.workspace, newTabPlace) : ''}
          apply={apply}
          onClose={() => setNewTabPlace(null)}
        />
        <ConfirmDelete pending={pendingDelete} onClose={() => setPendingDelete(null)} />
        <RemoveProfileDialog
          profile={removing}
          others={snapshot.workspace.profiles.filter((profile) => profile.id !== removingProfile)}
          onClose={() => setRemovingProfile(null)}
          onRemove={(moveItemsTo) => {
            if (removingProfile) void apply({ type: 'removeProfile', profile: removingProfile, moveItemsTo });
            setRemovingProfile(null);
          }}
        />
        {snapshot.needsDataFile && <DataFileDialog defaultPath={snapshot.dataPath} choose={workspace.chooseDataFile} />}
        <p className="toast" role="status">
          {workspace.notice}
        </p>
      </div>
    </DragProvider>
  );
}

function MainView({
  snapshot,
  shown,
  apply,
  actions,
  onSelect,
  notify,
  noteRequest,
}: {
  snapshot: Snapshot;
  shown: Selection | null;
  apply: ReturnType<typeof useWorkspace>['apply'];
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
  notify: (text: string) => void;
  noteRequest: { id: string; at: number } | null;
}) {
  const { workspace } = snapshot;
  const requestFor = (id: string) => (noteRequest?.id === id ? noteRequest.at : 0);
  if (shown?.kind === 'tab' && locate(workspace, shown.id)) {
    return (
      <TabDetail
        key={shown.id}
        snapshot={snapshot}
        tab={shown.id}
        apply={apply}
        actions={actions}
        onSelect={onSelect}
        notify={notify}
        noteRequest={requestFor(shown.id)}
      />
    );
  }
  if (shown?.kind === 'group') {
    const group = findGroup(workspace, shown.id);
    if (group) {
      return (
        <ContainerView
          key={group.id}
          snapshot={snapshot}
          shown={{ kind: 'group', item: group }}
          apply={apply}
          actions={actions}
          onSelect={onSelect}
          noteRequest={requestFor(group.id)}
        />
      );
    }
  }
  if (shown?.kind === 'folder') {
    const folder = findFolder(workspace, shown.id);
    if (folder) {
      return (
        <ContainerView
          key={folder.id}
          snapshot={snapshot}
          shown={{ kind: 'folder', item: folder }}
          apply={apply}
          actions={actions}
          onSelect={onSelect}
          noteRequest={requestFor(folder.id)}
        />
      );
    }
  }
  const profile = shown?.kind === 'profile' ? findProfile(workspace, shown.id) : undefined;
  return profile ? (
    <ProfileBoard key={profile.id} snapshot={snapshot} profile={profile} apply={apply} actions={actions} onSelect={onSelect} />
  ) : (
    <main className="group">
      <p className="group__empty">Create a profile to start.</p>
    </main>
  );
}

/** The selection if it still exists, else the first profile. */
function resolveSelection(snapshot: Snapshot, selection: Selection | null): Selection | null {
  const { workspace } = snapshot;
  if (selection) {
    const exists =
      selection.kind === 'profile'
        ? findProfile(workspace, selection.id)
        : selection.kind === 'group'
          ? findGroup(workspace, selection.id)
          : selection.kind === 'folder'
            ? findFolder(workspace, selection.id)
            : locate(workspace, selection.id);
    if (exists) return selection;
  }
  const first = workspace.profiles[0];
  return first ? { kind: 'profile', id: first.id } : null;
}

/** The sidebar width is a per-computer convenience, so localStorage is enough. */
function readWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved ? clampWidth(saved) : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function saveWidth(width: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // Storage can be unavailable; the width then resets on restart.
  }
}
