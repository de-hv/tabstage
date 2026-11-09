import { useEffect, useState } from 'react';

import { Banner } from './components/Banner';
import { CreateDialog, type CreateRequest } from './components/CreateDialog';
import { DragProvider } from './components/DragDrop';
import { GroupView, type View } from './components/GroupView';
import { Palette } from './components/Palette';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { useWorkspace } from './state/useWorkspace';

export function App() {
  const workspace = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  // A new group is added at the end; select it once the snapshot has it.
  const [selectNew, setSelectNew] = useState(false);
  const [view, setView] = useState<View>(readView);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);
  const { snapshot, error } = workspace;

  useEffect(() => {
    if (!selectNew || !snapshot) return;
    setSelected(snapshot.workspace.groups.at(-1)?.id ?? null);
    setSelectNew(false);
  }, [selectNew, snapshot]);

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

  const { groups } = snapshot.workspace;
  const group = groups.find((candidate) => candidate.id === selected) ?? groups[0];

  return (
    <DragProvider workspace={snapshot.workspace} apply={(command) => void workspace.apply(command)}>
    <div className="app">
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
        selected={group?.id ?? null}
        onSelect={(id) => {
          setSelected(id);
          setSettingsOpen(false);
        }}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddGroup={async (profile, name, color) => {
          const failure = await workspace.apply({ type: 'addGroup', profile, name, color });
          if (!failure) setSelectNew(true);
          return !failure;
        }}
        onAddProfile={async (name) => !(await workspace.apply({ type: 'addProfile', name }))}
        apply={workspace.apply}
        onCreate={(profile, kind) => {
          const found = snapshot.workspace.profiles.find((candidate) => candidate.id === profile);
          if (found) setCreateRequest({ profile: found, kind });
        }}
      />
      {settingsOpen ? (
        <Settings
          snapshot={snapshot}
          apply={(command) => void workspace.apply(command)}
          inspectDataFolder={workspace.inspectDataFolder}
          relocate={workspace.relocate}
          onRevealDataFile={() => void workspace.revealDataFile()}
        />
      ) : group ? (
        <GroupView
          snapshot={snapshot}
          group={group}
          view={view}
          onViewChange={(next) => {
            setView(next);
            saveView(next);
          }}
          apply={workspace.apply}
          openTab={workspace.openTab}
          openFolder={workspace.openFolder}
          openGroup={workspace.openGroup}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <main className="group">
          <p className="group__empty">Create your first group with the + of a profile.</p>
        </main>
      )}
      <Palette snapshot={snapshot} openTab={workspace.openTab} openFolder={workspace.openFolder} />
      <CreateDialog
        request={createRequest}
        groups={createRequest ? groups.filter((candidate) => candidate.profile === createRequest.profile.id) : []}
        apply={workspace.apply}
        onClose={() => setCreateRequest(null)}
      />
      <p className="toast" role="status">
        {workspace.notice}
      </p>
    </div>
    </DragProvider>
  );
}

const VIEW_KEY = 'tabstage.view';

/** The chosen view is a per-machine convenience, so localStorage is enough. */
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage can be unavailable; the view then resets on restart.
  }
}
