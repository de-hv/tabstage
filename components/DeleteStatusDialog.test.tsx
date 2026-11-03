import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusMother } from '@/__mocks__/status.mother';
import { DeleteStatusDialog } from './DeleteStatusDialog';

afterEach(() => {
  cleanup();
});

function setup(count = 3) {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteStatusDialog
      status={StatusMother.inProgress()}
      count={count}
      statuses={StatusMother.defaults()}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { user, onConfirm, onCancel };
}

describe('DeleteStatusDialog', () => {
  it('asks where the tabs of the status go', () => {
    setup();

    expect(screen.getByRole('alertdialog', { name: 'Delete In progress?' })).toBeTruthy();
    expect(screen.getByText('It has 3 tabs. Where should they go?')).toBeTruthy();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'To do',
      'In review',
      'In dev',
      'Done',
    ]);
  });

  it('says "1 tab" for a single tab', () => {
    setup(1);

    expect(screen.getByText('It has 1 tab. Where should they go?')).toBeTruthy();
  });

  it('moves the tabs to the chosen status', async () => {
    const { user, onConfirm } = setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move to' }), 'Done');

    await user.click(screen.getByRole('button', { name: 'Move to Done' }));

    expect(onConfirm).toHaveBeenCalledWith({ moveTo: 'done' });
  });

  it('removes the tabs', async () => {
    const { user, onConfirm } = setup();

    await user.click(screen.getByRole('button', { name: 'Remove them' }));

    expect(onConfirm).toHaveBeenCalledWith({ remove: true });
  });

  it('cancels with the button and with Escape', async () => {
    const { user, onCancel } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
