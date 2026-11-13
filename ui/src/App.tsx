import { ArchiveRestore } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

import type { Snapshot, Target } from './api/types';
import { Banner } from './components/Banner';
import { ConfirmDelete, type PendingDelete } from './components/ConfirmDelete';
import { DataFileDialog } from './components/DataFileDialog';
import { DragProvider } from './components/DragDrop';
import { ImportWizard } from './components/ImportWizard';
import { NoteView } from './components/NoteView';
import { Palette } from './components/Palette';
import { ProfileBoard } from './components/ProfileBoard';
import { RemoveProfileDialog } from './components/ProfilesEditor';
import { ResizeHandle, SIDEBAR_DEFAULT, clampWidth } from './components/ResizeHandle';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { TicketView } from './components/TicketView';
import { profileBrowser } from './lib/browsers';
import { parseTicketLine } from './lib/markdown';
import { findNote, findProfile, findTicket, pinnedIndex } from './lib/workspace';
import type { ItemActions, Selection } from './state/selection';
import { usePreference } from './state/usePreference';
import { useWorkspace } from './state/useWorkspace';

const WIDTH_KEY = 'tabstage.sidebarWidth';

/** A request for the shown ticket or note, such as "start editing the note". */
type Request = { id: string; at: number } | null;

export function App() {
  const workspace = useWorkspace();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusProfile, setFocusProfile] = useState<string | null>(null);
  const [focusStatuses, setFocusStatuses] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [removingProfile, setRemovingProfile] = useState<string | null>(null);
  const [width, setWidth] = useState(readWidth);
  const [collapsed, setCollapsed] = usePreference('tabstage.sidebarCollapsed', false);
  const [noteRequest, setNoteRequest] = useState<Request>(null);
  /** The file the import assistant reads: `null` the one set aside, `undefined` closed. */
  const [importPath, setImportPath] = useState<string | null | undefined>(undefined);
  const askedToImport = useRef(false);
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

  // The first time a file from before tickets is found, offer to import it.
  const legacyBackup = snapshot?.legacyBackup ?? null;
  useEffect(() => {
    if (legacyBackup && !askedToImport.current) {
      askedToImport.current = true;
      setImportPath(null);
    }
  }, [legacyBackup]);

  if (!snapshot) {
    return error ? (
      <Banner error={error} onReload={workspace.reload} onKeepMine={workspace.keepMine} onDismiss={workspace.reload} />
    ) : null;
  }

  const { apply } = workspace;
  const shown = resolveSelection(snapshot, selection);
  const select = (next: Selection) => {
    setSelection(next);
    setSettingsOpen(false);
    setNoteRequest(null);
  };
  const browserOf = (profile: string) => profileBrowser(snapshot, profile)?.name ?? '';
  const ownerSelection = (owner: { ticket: string } | { note: string }): Selection =>
    'ticket' in owner ? { kind: 'ticket', id: owner.ticket } : { kind: 'note', id: owner.note };

  const actions: ItemActions = {
    openTicket: (ticket) => {
      const found = findTicket(snapshot.workspace, ticket);
      void workspace.openTicket(ticket, found ? browserOf(found.profile.id) : '');
    },
    openTicketAll: (ticket) => void workspace.openTicketAll(ticket),
    openUrl: (profile, url) => void workspace.openUrl(profile, url),
    copyLink: (url) => {
      navigator.clipboard.writeText(url).then(
        () => workspace.notify('Link copied'),
        () => workspace.notify('Could not copy the link'),
      );
    },
    newTicket: async (place, text, status, kind) => {
      const id = crypto.randomUUID();
      const { key, title } = parseTicketLine(text);
      const failure = await apply({
        type: 'addTicket',
        id,
        place,
        title,
        ...(key ? { key } : {}),
        status,
        ...(kind && kind !== 'ticket' ? { kind } : {}),
      });
      if (failure) return false;
      select({ kind: 'ticket', id });
      return true;
    },
    newNote: async (profile, title) => {
      const id = crypto.randomUUID();
      const failure = await apply({ type: 'addNote', id, profile, title });
      if (failure) return false;
      select({ kind: 'note', id });
      setNoteRequest({ id, at: Date.now() });
      return true;
    },
    requestDelete: (target) => {
      if ('profile' in target) {
        setRemovingProfile(target.profile);
        return;
      }
      if ('ticket' in target) {
        const found = findTicket(snapshot.workspace, target.ticket);
        if (!found) return;
        const run = () => void apply({ type: 'removeTicket', ticket: target.ticket });
        const children = found.ticket.children?.length ?? 0;
        if (children > 0) {
          setPendingDelete({ name: found.ticket.title, contents: `its ${children} sub-ticket${children === 1 ? '' : 's'}`, run });
        } else run();
        return;
      }
      const found = findNote(snapshot.workspace, target.note);
      if (!found) return;
      const run = () => void apply({ type: 'removeNote', note: target.note });
      if (found.note.body) setPendingDelete({ name: found.note.title, contents: 'its text', run });
      else run();
    },
    setIcon: (target, icon) => void apply({ type: 'setIcon', target, icon }),
    editText: (owner) => {
      const next = ownerSelection(owner);
      select(next);
      setNoteRequest({ id: next.id, at: Date.now() });
    },
    configureProfile: (profile) => {
      setFocusProfile(profile);
      setFocusStatuses(false);
      setSettingsOpen(true);
    },
    togglePin: (target) =>
      void apply(pinnedIndex(snapshot.workspace, target) === -1 ? { type: 'pin', target } : { type: 'unpin', target }),
    select,
    editStatuses: () => {
      setFocusProfile(null);
      setFocusStatuses(true);
      setSettingsOpen(true);
    },
  };

  togglePinRef.current = () => {
    if (settingsOpen || !shown || shown.kind === 'profile') return;
    const target: Target = shown.kind === 'ticket' ? { ticket: shown.id } : { note: shown.id };
    actions.togglePin(target);
  };

  const removing = removingProfile ? (findProfile(snapshot.workspace, removingProfile) ?? null) : null;
  const requestFor = (request: Request, id: string) => (request?.id === id ? request.at : 0);

  return (
    <DragProvider workspace={snapshot.workspace} apply={(command) => void apply(command)}>
      <div className="app" data-collapsed={collapsed || undefined} style={{ '--sidebar-width': `${width}px` } as CSSProperties}>
        <div className="app__banner">
          {error && (
            <Banner error={error} onReload={workspace.reload} onKeepMine={workspace.keepMine} onDismiss={workspace.dismissError} />
          )}
          {snapshot.legacyBackup && (
            <div className="banner banner--info" role="status">
              <ArchiveRestore className="icon" aria-hidden="true" />
              <span className="banner__text">Your groups and folders from the previous version are saved aside and ready to import.</span>
              <button type="button" className="button button--accent" onClick={() => setImportPath(null)}>
                Import them
              </button>
              <button type="button" className="button" onClick={() => void workspace.dismissImport()}>
                Not now
              </button>
            </div>
          )}
        </div>
        <Sidebar
          snapshot={snapshot}
          selection={shown}
          settingsOpen={settingsOpen}
          onSelect={select}
          onOpenSettings={() => {
            setFocusProfile(null);
            setFocusStatuses(false);
            setSettingsOpen(true);
          }}
          apply={apply}
          actions={actions}
          collapsed={collapsed}
          onCollapse={setCollapsed}
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
            focusStatuses={focusStatuses}
            onImport={setImportPath}
          />
        ) : shown?.kind === 'ticket' ? (
          <TicketView
            key={shown.id}
            snapshot={snapshot}
            ticket={shown.id}
            apply={apply}
            actions={actions}
            onSelect={select}
            notify={workspace.notify}
            noteRequest={requestFor(noteRequest, shown.id)}
          />
        ) : shown?.kind === 'note' ? (
          <NoteView
            key={shown.id}
            snapshot={snapshot}
            note={shown.id}
            apply={apply}
            actions={actions}
            onSelect={select}
            notify={workspace.notify}
            noteRequest={requestFor(noteRequest, shown.id)}
          />
        ) : shown?.kind === 'profile' && findProfile(snapshot.workspace, shown.id) ? (
          <ProfileBoard
            key={shown.id}
            snapshot={snapshot}
            profile={findProfile(snapshot.workspace, shown.id)!}
            apply={apply}
            actions={actions}
            onSelect={select}
          />
        ) : (
          <main className="group">
            <p className="group__empty">Create a profile to start.</p>
          </main>
        )}
        <Palette snapshot={snapshot} onSelect={select} />
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
        <ImportWizard
          path={importPath}
          onClose={() => setImportPath(undefined)}
          previewImport={workspace.previewImport}
          importLegacy={workspace.importLegacy}
        />
        {snapshot.needsDataFile && <DataFileDialog defaultPath={snapshot.dataPath} choose={workspace.chooseDataFile} />}
        <p className="toast" role="status">
          {workspace.notice}
        </p>
      </div>
    </DragProvider>
  );
}

/** The selection if it still exists, else the first profile. */
function resolveSelection(snapshot: Snapshot, selection: Selection | null): Selection | null {
  const { workspace } = snapshot;
  if (selection) {
    const exists =
      selection.kind === 'profile'
        ? findProfile(workspace, selection.id)
        : selection.kind === 'ticket'
          ? findTicket(workspace, selection.id)
          : findNote(workspace, selection.id);
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
