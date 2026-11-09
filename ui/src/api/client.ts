import { invoke } from '@tauri-apps/api/core';

import type { AppError, Command, DataFileInfo, OpenSummary, Opened, Relocate, Snapshot, Uuid } from './types';

/** Typed wrappers around the IPC commands in src-tauri/src/commands.rs. */
export const api = {
  snapshot: () => invoke<Snapshot>('snapshot'),
  apply: (command: Command) => invoke<Snapshot>('apply', { command }),
  reload: () => invoke<Snapshot>('reload'),
  forceSave: () => invoke<Snapshot>('force_save'),
  hasExternalChange: () => invoke<boolean>('has_external_change'),
  refreshBrowsers: () => invoke<Snapshot>('refresh_browsers'),
  openTab: (tab: Uuid) => invoke<Opened>('open_tab', { tab }),
  openFolder: (folder: Uuid) => invoke<OpenSummary>('open_folder', { folder }),
  openGroup: (group: Uuid) => invoke<OpenSummary>('open_group', { group }),
  inspectDataFolder: (folder: string) => invoke<DataFileInfo>('inspect_data_folder', { folder }),
  relocate: (folder: string, mode: Relocate) => invoke<Snapshot>('relocate', { folder, mode }),
  revealDataFile: () => invoke<void>('reveal_data_file'),
};

/** Narrows an unknown rejection to the error payload Rust sends. */
export function asAppError(error: unknown): AppError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error as AppError;
  }
  return { code: 'internal', message: String(error) };
}
