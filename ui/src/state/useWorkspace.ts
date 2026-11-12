import { useCallback, useEffect, useRef, useState } from 'react';

import { api, asAppError } from '../api/client';
import type { AppError, Command, DataFileInfo, Opened, Relocate, Snapshot, Target } from '../api/types';

/** Errors a form shows next to its own fields instead of in the banner. */
const INLINE_CODES: ReadonlySet<AppError['code']> = new Set(['invalidUrl', 'invalid', 'cloudFolder']);

const NOTICE_MS = 3000;

export interface WorkspaceState {
  snapshot: Snapshot | null;
  error: AppError | null;
  notice: string;
  /** Applies a change. Resolves to the error, if any, so forms can show it. */
  apply: (command: Command) => Promise<AppError | null>;
  reload: () => Promise<void>;
  keepMine: () => Promise<void>;
  dismissError: () => void;
  /** Opens a tab; `browserName` is for the "already open" notice. */
  openTab: (tab: string, browserName: string) => Promise<void>;
  /** Opens the ticket of an item with its profile's ticket URL. */
  openTicket: (target: Target) => Promise<void>;
  /** Opens an address, such as a link in a note, in a profile's browser. */
  openUrl: (profile: string, url: string) => Promise<void>;
  openFolder: (folder: string) => Promise<void>;
  openGroup: (group: string) => Promise<void>;
  openProfile: (profile: string) => Promise<void>;
  /** First run. Resolves to the error, if any, so the dialog can show it. */
  chooseDataFile: (folder: string | null) => Promise<AppError | null>;
  /** What a folder holds, or `null` when it cannot be read (error shown). */
  inspectDataFolder: (folder: string) => Promise<DataFileInfo | null>;
  relocate: (folder: string, mode: Relocate) => Promise<void>;
  revealDataFile: () => Promise<void>;
  /** Shows a short notice at the bottom of the window. */
  notify: (text: string) => void;
}

/** Loads the snapshot, applies changes and follows changes from other devices. */
export function useWorkspace(): WorkspaceState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((text: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(''), NOTICE_MS);
  }, []);

  const run = useCallback(async (task: () => Promise<Snapshot>, inline = false) => {
    try {
      setSnapshot(await task());
      setError(null);
      return null;
    } catch (raw) {
      const failure = asAppError(raw);
      if (!(inline && INLINE_CODES.has(failure.code))) setError(failure);
      return failure;
    }
  }, []);

  useEffect(() => {
    void run(api.snapshot);
    return () => clearTimeout(noticeTimer.current);
  }, [run]);

  // Every change is saved right away, so a file that changed on disk was
  // changed by another device and is safe to load.
  useEffect(() => {
    const onFocus = async () => {
      try {
        if (await api.hasExternalChange()) await run(api.reload);
      } catch (raw) {
        setError(asAppError(raw));
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [run]);

  const attempt = useCallback(async (task: () => Promise<void>) => {
    try {
      await task();
    } catch (raw) {
      setError(asAppError(raw));
    }
  }, []);

  return {
    snapshot,
    error,
    notice,
    apply: (command) => run(() => api.apply(command), true),
    reload: async () => void (await run(api.reload)),
    keepMine: async () => void (await run(api.forceSave)),
    dismissError: () => setError(null),
    openTab: (tab, browserName) =>
      attempt(async () => {
        const opened: Opened = await api.openTab(tab);
        if (opened === 'focusedExisting') show(`Already open in ${browserName}`);
      }),
    openTicket: (target) => attempt(async () => void (await api.openTicket(target))),
    openUrl: (profile, url) => attempt(async () => void (await api.openUrl(profile, url))),
    openFolder: (folder) => attempt(async () => void (await api.openFolder(folder))),
    openGroup: (group) => attempt(async () => void (await api.openGroup(group))),
    openProfile: (profile) => attempt(async () => void (await api.openProfile(profile))),
    chooseDataFile: (folder) => run(() => api.chooseDataFile(folder), true),
    inspectDataFolder: async (folder) => {
      try {
        return await api.inspectDataFolder(folder);
      } catch (raw) {
        setError(asAppError(raw));
        return null;
      }
    },
    relocate: async (folder, mode) => void (await run(() => api.relocate(folder, mode))),
    revealDataFile: () => attempt(api.revealDataFile),
    notify: show,
  };
}
