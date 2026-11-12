import { invoke } from '@tauri-apps/api/core';

import type {
  AppError,
  Command,
  DataFileInfo,
  ImportPreview,
  OpenSummary,
  Opened,
  Relocate,
  Role,
  Snapshot,
  Uuid,
} from './types';

/** Typed wrappers around the IPC commands in src-tauri/src/commands.rs. */
export const api = {
  snapshot: () => invoke<Snapshot>('snapshot'),
  apply: (command: Command) => invoke<Snapshot>('apply', { command }),
  reload: () => invoke<Snapshot>('reload'),
  forceSave: () => invoke<Snapshot>('force_save'),
  hasExternalChange: () => invoke<boolean>('has_external_change'),
  refreshBrowsers: () => invoke<Snapshot>('refresh_browsers'),
  openLink: (link: Uuid) => invoke<Opened>('open_link', { link }),
  openTicket: (ticket: Uuid) => invoke<Opened>('open_ticket', { ticket }),
  openTicketAll: (ticket: Uuid) => invoke<OpenSummary>('open_ticket_all', { ticket }),
  openNote: (note: Uuid) => invoke<OpenSummary>('open_note', { note }),
  openUrl: (profile: Uuid, url: string) => invoke<Opened>('open_url', { profile, url }),
  /** `path: null` reads the file set aside at startup. */
  previewImport: (path: string | null, roles: Record<string, Role>) =>
    invoke<ImportPreview>('preview_import', { path, roles }),
  importLegacy: (path: string | null, roles: Record<string, Role>) =>
    invoke<Snapshot>('import_legacy', { path, roles }),
  dismissImport: () => invoke<Snapshot>('dismiss_import'),
  /** First run: `null` keeps the data file in the default location. */
  chooseDataFile: (folder: string | null) => invoke<Snapshot>('choose_data_file', { folder }),
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
