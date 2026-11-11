import { type CSSProperties, useState } from 'react';

import type { Place, Snapshot, Target } from './api/types';
import { Banner } from './components/Banner';
import { ConfirmDelete, type PendingDelete } from './components/ConfirmDelete';
import { ContainerView } from './components/ContainerView';
import { DataFileDialog } from './components/DataFileDialog';
import { DetailsDialog } from './components/DetailsDialog';
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
import { countTabs, findFolder, findGroup, findProfile, locate, placeLabel, targetDetails } from './lib/workspace';
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
  const [compact, setCompact] = usePreference('tabstage.sidebarCompact', false);
  const [indentGuides, setIndentGuides] = usePreference('tabstage.indentGuides', true);
  const [editingDetails, setEditingDetails] = useState<Target | null>(null);
  const { snapshot, error } = workspace;

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
    editDetails: setEditingDetails,
    configureProfile: (profile) => {
      setFocusProfile(profile);
      setSettingsOpen(true);
    },
  };

  const removing = removingProfile ? findProfile(snapshot.workspace, removingProfile) ?? null : null;

  return (
    <DragProvider workspace={snapshot.workspace} apply={(command) => void apply(command)}>
      <div className="app" style={{ '--sidebar-width': `${width}px` } as CSSProperties}>
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
          compact={compact}
          onCompact={setCompact}
          indentGuides={indentGuides}
        />
        <ResizeHandle
          width={width}
          onResize={(next, done) => {
            setWidth(next);
            if (done) saveWidth(next);
          }}
        />
        {settingsOpen ? (
          <Settings
            snapshot={snapshot}
            apply={(command) => void apply(command)}
            inspectDataFolder={workspace.inspectDataFolder}
            relocate={workspace.relocate}
            onRevealDataFile={() => void workspace.revealDataFile()}
            focusProfile={focusProfile}
            showUrls={showUrls}
            onShowUrls={setShowUrls}
            compact={compact}
            onCompact={setCompact}
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
          />
        )}
        <Palette
          snapshot={snapshot}
          openTab={(tab) => actions.open({ tab })}
          openFolder={(folder) => actions.open({ folder })}
        />
        <NewTabDialog
          place={newTabPlace}
          placeName={newTabPlace ? placeLabel(snapshot.workspace, newTabPlace) : ''}
          apply={apply}
          onClose={() => setNewTabPlace(null)}
        />
        <DetailsDialog
          target={editingDetails}
          details={editingDetails ? targetDetails(snapshot.workspace, editingDetails) : null}
          apply={apply}
          onClose={() => setEditingDetails(null)}
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
}: {
  snapshot: Snapshot;
  shown: Selection | null;
  apply: ReturnType<typeof useWorkspace>['apply'];
  actions: ItemActions;
  onSelect: (selection: Selection) => void;
  notify: (text: string) => void;
}) {
  const { workspace } = snapshot;
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
