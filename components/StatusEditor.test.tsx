import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '../__mocks__/board.mother';
import { StatusBuilder } from '../__mocks__/status.builder';
import { StatusMother } from '../__mocks__/status.mother';
import { useBoard } from '../hooks/useBoard';
import { useStatuses } from '../hooks/useStatuses';
import { boardItem, getBoard } from '../lib/board';
import { getStatuses, saveStatuses, statusesItem } from '../lib/statuses';
import { StatusEditor } from './StatusEditor';

/** Reads the statuses and board from storage, as the options page does. */
function Harness() {
  const statuses = useStatuses();
  const board = useBoard();
  return statuses && board ? <StatusEditor statuses={statuses} board={board} /> : null;
}

beforeEach(async () => {
  fakeBrowser.reset();
  await boardItem.setValue(BoardMother.sample());
});

afterEach(() => {
  cleanup();
});

async function setup() {
  const user = userEvent.setup();
  render(<Harness />);
  await screen.findByRole('region', { name: 'Statuses' });
  return { user };
}

const labels = () =>
  screen.getAllByRole('textbox', { name: /^Label of / }).map((input) => (input as HTMLInputElement).value);
const row = (label: string) => screen.getByRole('textbox', { name: `Label of ${label}` }).closest('li')!;

describe('StatusEditor', () => {
  it('lists the statuses with their tab counts', async () => {
    await setup();

    expect(labels()).toEqual(StatusMother.defaults().map((status) => status.label));
    expect(within(row('To do')).getByText('2 tabs')).toBeTruthy();
    expect(within(row('Done')).getByText('0 tabs')).toBeTruthy();
  });

  it('renames on Enter and reverts on Escape', async () => {
    const { user } = await setup();
    const field = screen.getByRole('textbox', { name: 'Label of Done' });

    await user.clear(field);
    await user.type(field, 'Shipped{Enter}');
    await waitFor(async () => expect((await getStatuses()).at(-1)?.label).toBe('Shipped'));

    const renamed = screen.getByRole('textbox', { name: 'Label of Shipped' });
    await user.type(renamed, 'xx{Escape}');
    expect((renamed as HTMLInputElement).value).toBe('Shipped');
  });

  it('shows an error for a duplicate label and keeps the stored list', async () => {
    const { user } = await setup();
    const field = screen.getByRole('textbox', { name: 'Label of Done' });

    await user.clear(field);
    await user.type(field, 'to do{Enter}');

    expect((await screen.findByRole('alert')).textContent).toContain('more than one status');
    expect(await getStatuses()).toEqual(StatusMother.defaults());
  });

  it('recolors with an accent swatch', async () => {
    const { user } = await setup();

    await user.click(within(row('Done')).getByRole('radio', { name: 'teal' }));

    await waitFor(async () => expect((await getStatuses()).at(-1)?.color).toBe('teal'));
  });

  it('moves a status up and down', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Move Done up' }));

    await waitFor(() => expect(labels().slice(-2)).toEqual(['Done', 'In dev']));
    expect((screen.getByRole('button', { name: 'Move To do up' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds a status with the form', async () => {
    const { user } = await setup();

    await user.type(screen.getByRole('textbox', { name: 'New status label' }), 'QA');
    await user.click(screen.getByRole('radiogroup', { name: 'Color of the new status' }).querySelector('[aria-label="red"]')!);
    await user.click(screen.getByRole('button', { name: 'Add status' }));

    await waitFor(async () => expect((await getStatuses()).at(-1)).toMatchObject({ label: 'QA', color: 'red' }));
    expect((screen.getByRole('textbox', { name: 'New status label' }) as HTMLInputElement).value).toBe('');
  });

  it('refuses to add a status with no label', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Add status' }));

    expect((await screen.findByRole('alert')).textContent).toBe('A status needs a label.');
  });

  it('deletes an empty status without asking', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Delete Done' }));

    await waitFor(() => expect(labels()).not.toContain('Done'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks where the tabs go when deleting a status with tabs', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Delete To do' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete To do?' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Move to' }), 'Done');
    await user.click(within(dialog).getByRole('button', { name: 'Move to Done' }));

    await waitFor(() => expect(labels()).not.toContain('To do'));
    expect((await getBoard()).items.slice(0, 2).map((item) => item.statusId)).toEqual(['done', 'done']);
  });

  it('cannot delete the last status', async () => {
    await saveStatuses([new StatusBuilder().build()]);
    await setup();

    expect((screen.getByRole('button', { name: 'Delete QA' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('restores the defaults after an inline confirm, moving orphaned tabs to the first status', async () => {
    await statusesItem.setValue([new StatusBuilder().with({ id: 'todo', label: 'Backlog' }).build()]);
    await boardItem.setValue({ groups: [], items: [{ ...BoardMother.sample().items[0]!, statusId: 'gone' }] });
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Restore defaults' }));
    await user.click(within(screen.getByRole('alertdialog', { name: 'Restore defaults?' })).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(labels()).toEqual(StatusMother.defaults().map((status) => status.label)));
    expect((await getBoard()).items[0]?.statusId).toBe('todo');
  });

  it('shows an error when saving fails', async () => {
    const { user } = await setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(statusesItem, 'setValue').mockRejectedValue(new Error('quota'));

    await user.click(within(row('Done')).getByRole('radio', { name: 'teal' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Could not save the statuses.');
  });
});
