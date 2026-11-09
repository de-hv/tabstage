import { mockIPC } from '@tauri-apps/api/mocks';

import type { AppError, Command, Snapshot } from '../api/types';
import fixture from './fixtures/snapshot.json';

/** The Rust-generated snapshot (see `ui_fixture_matches_the_rust_snapshot`). */
export function snapshotFixture(): Snapshot {
  return structuredClone(fixture) as Snapshot;
}

export interface IpcCall {
  cmd: string;
  args: Record<string, unknown>;
}

type Handler = (args: Record<string, unknown>) => unknown;

/**
 * Fakes the Rust side. Every command returns the fixture unless a handler
 * overrides it; a handler that throws an `AppError` makes the call reject.
 * Returns the list of calls made, in order.
 */
export function installIpc(handlers: Record<string, Handler> = {}): IpcCall[] {
  const calls: IpcCall[] = [];
  mockIPC(
    (cmd, payload) => {
      const args = (payload ?? {}) as Record<string, unknown>;
      calls.push({ cmd, args });
      const handler = handlers[cmd];
      if (handler) return handler(args);
      if (cmd === 'has_external_change') return false;
      if (cmd === 'open_tab') return 'openedNew';
      if (cmd === 'open_folder' || cmd === 'open_group') return { opened: 1, focused: 0 };
      if (cmd === 'plugin:dialog|open') return null;
      if (cmd === 'inspect_data_folder') {
        return { path: `${String(args.folder)}/workspace.json`, exists: false, groups: 0, tabs: 0 };
      }
      return snapshotFixture();
    },
    { shouldMockEvents: true },
  );
  return calls;
}

/** The commands sent through `apply`, in order. */
export function appliedCommands(calls: IpcCall[]): Command[] {
  return calls.filter((call) => call.cmd === 'apply').map((call) => call.args.command as Command);
}

export function appError(code: AppError['code'], message: string = code): AppError {
  return { code, message };
}
