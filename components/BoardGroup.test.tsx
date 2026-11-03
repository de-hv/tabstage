import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardGroupBuilder } from '@/__mocks__/board-group.builder';
import { ItemBuilder } from '@/__mocks__/item.builder';
import type { GroupView } from '@/lib/tiles';
import { BoardGroup } from './BoardGroup';

afterEach(() => {
  cleanup();
});

const view = (collapsed = false): GroupView => ({
  group: new BoardGroupBuilder().with({ collapsed }).build(),
  items: [
    new ItemBuilder().with({ id: 'a', title: 'PR #42', groupId: 'group-1' }).build(),
    new ItemBuilder().with({ id: 'b', title: 'Spec', groupId: 'group-1' }).closed().build(),
  ],
});

function setup(groupView: GroupView, renaming = false) {
  const user = userEvent.setup();
  const on = {
    onToggle: vi.fn(),
    onRename: vi.fn(),
    onCancelRename: vi.fn(),
    onMenu: vi.fn(),
    onOpenItem: vi.fn(),
    onRemoveItem: vi.fn(),
    onItemMenu: vi.fn(),
  };
  render(
    <ul>
      <BoardGroup view={groupView} renaming={renaming} {...on} />
    </ul>,
  );
  return { user, ...on };
}

describe('BoardGroup', () => {
  it('shows the name, count and its tabs when expanded', () => {
    setup(view());

    const header = screen.getByRole('button', { name: /CAR-6115/ });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(header.id).toBe('group-group-1');
    expect(screen.getByLabelText('2 tabs')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'CAR-6115' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'PR #42' })).toBeTruthy();
  });

  it('hides its tabs when collapsed', () => {
    setup(view(true));

    expect(screen.getByRole('button', { name: /CAR-6115/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'PR #42' })).toBeNull();
  });

  it('toggles on click', async () => {
    const groupView = view();
    const { user, onToggle } = setup(groupView);

    await user.click(screen.getByRole('button', { name: /CAR-6115/ }));

    expect(onToggle).toHaveBeenCalledWith(groupView.group);
  });

  it('opens the group menu on right-click', () => {
    const groupView = view();
    const { onMenu } = setup(groupView);

    fireEvent.contextMenu(screen.getByRole('button', { name: /CAR-6115/ }), { clientX: 5, clientY: 6 });

    expect(onMenu).toHaveBeenCalledWith(groupView.group, 5, 6);
  });

  it('renames with an inline field: Enter saves, Escape cancels', async () => {
    const groupView = view();
    const { user, onRename } = setup(groupView, true);

    const field = screen.getByRole('textbox', { name: 'Rename group CAR-6115' });
    await user.clear(field);
    await user.type(field, 'CAR-7000{Enter}');

    expect(onRename).toHaveBeenCalledWith(groupView.group, 'CAR-7000');
  });

  it('cancels the rename on Escape', async () => {
    const { user, onCancelRename, onRename } = setup(view(), true);

    await user.keyboard('{Escape}');

    expect(onCancelRename).toHaveBeenCalledOnce();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('says "No tabs" for an empty expanded group', () => {
    setup({ group: new BoardGroupBuilder().build(), items: [] });

    expect(screen.getByText('No tabs')).toBeTruthy();
  });
});
