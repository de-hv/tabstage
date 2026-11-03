import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardMother } from '@/__mocks__/board.mother';
import { StatusMother } from '@/__mocks__/status.mother';
import { PaletteLayer } from './PaletteLayer';

afterEach(() => {
  cleanup();
});

function setup(onRun = vi.fn().mockResolvedValue(undefined), board = BoardMother.sample()) {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<PaletteLayer board={board} statuses={StatusMother.defaults()} onRun={onRun} onClose={onClose} />);
  return { user, onRun, onClose };
}

const options = () => screen.getAllByRole('option').map((option) => option.textContent);

describe('PaletteLayer', () => {
  it('focuses the command box and lists groups and tabs', () => {
    setup();

    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Command' }));
    expect(options()[0]).toContain('CAR-6115');
    expect(options()).toHaveLength(5);
  });

  it('runs "<item> <status>" with Enter and closes', async () => {
    const { user, onRun, onClose } = setup();

    await user.keyboard('6115 done{Enter}');

    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ kind: 'move-group', status: StatusMother.done() }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('moves the selection with the arrows', async () => {
    const { user, onRun } = setup();

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ kind: 'open-item', item: expect.objectContaining({ id: 'item-1' }) }));
  });

  it('marks a closed link in the results', async () => {
    const { user } = setup();

    await user.keyboard('docs');

    expect(options()).toEqual(['TabDocs guideclosedTo do']);
  });

  it('shows an error and stays open when the command fails', async () => {
    const { user, onClose } = setup(vi.fn().mockRejectedValue(new Error('boom')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await user.keyboard('{Enter}');

    expect((await screen.findByRole('alert')).textContent).toBe('Could not run the command. Try again.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { user, onClose } = setup();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('explains what to do with an empty board, and when nothing matches', async () => {
    const { user } = setup(undefined, BoardMother.empty());

    expect(screen.getByText('Nothing in Tabstage yet. Type “add” to add this tab.')).toBeTruthy();
    await user.keyboard('zzz');
    expect(screen.getByText('No results for “zzz”.')).toBeTruthy();
  });
});
