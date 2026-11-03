import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardMother } from '@/__mocks__/board.mother';
import { StatusMother } from '@/__mocks__/status.mother';
import { buildTiles, type Tile } from '@/lib/tiles';
import { StatusTile, type TileHandlers } from './StatusTile';

afterEach(() => {
  cleanup();
});

const tiles = buildTiles(BoardMother.sample(), StatusMother.defaults());

function setup(tile: Tile, props: { focused?: boolean; renaming?: boolean; error?: string } = {}) {
  const user = userEvent.setup();
  const on: TileHandlers = {
    onActivate: vi.fn(),
    onStartRename: vi.fn(),
    onRename: vi.fn(),
    onCancelRename: vi.fn(),
    onStatusMenu: vi.fn(),
    onToggleGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onGroupMenu: vi.fn(),
    onOpenItem: vi.fn(),
    onRemoveItem: vi.fn(),
    onItemMenu: vi.fn(),
  };
  render(
    <StatusTile
      tile={tile}
      focused={props.focused ?? false}
      renaming={props.renaming ?? false}
      renamingGroupId={null}
      error={props.error}
      on={on}
    />,
  );
  return { user, on };
}

describe('StatusTile', () => {
  it('shows the status label, color, count and its tabs', () => {
    setup(tiles[0]!);

    const region = screen.getByRole('region', { name: 'To do' });
    expect(region.getAttribute('data-color')).toBe('lavender');
    expect(screen.getByLabelText('2 tabs')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Tabs in To do' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows groups before loose tabs', () => {
    setup(tiles[1]!);

    const list = screen.getByRole('list', { name: 'Tabs in In progress' });
    expect(list.firstElementChild?.className).toBe('group');
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('CAR-6115');
  });

  it('marks the focused tile for the accent border', () => {
    setup(tiles[0]!, { focused: true });

    expect(screen.getByRole('region').getAttribute('data-focused')).toBe('true');
  });

  it('draws an empty status compact, with "No tabs"', () => {
    setup(tiles[4]!);

    expect(screen.getByRole('region').getAttribute('data-empty')).toBe('true');
    expect(screen.getByText('No tabs')).toBeTruthy();
  });

  it('becomes the active tile when something inside gets focus', async () => {
    const { user, on } = setup(tiles[0]!);

    await user.tab();

    expect(on.onActivate).toHaveBeenCalledWith(tiles[0]!.status);
  });

  it('starts renaming on a double click of the label', async () => {
    const { user, on } = setup(tiles[0]!);

    await user.dblClick(screen.getByRole('heading', { name: 'To do' }));

    expect(on.onStartRename).toHaveBeenCalledWith(tiles[0]!.status);
  });

  it('saves the new label from the inline field', async () => {
    const { user, on } = setup(tiles[0]!, { renaming: true });

    const field = screen.getByRole('textbox', { name: 'Rename To do' });
    await user.clear(field);
    await user.type(field, 'Backlog{Enter}');

    expect(on.onRename).toHaveBeenCalledWith(tiles[0]!.status, 'Backlog');
  });

  it('opens the status menu from "⋯"', async () => {
    const { user, on } = setup(tiles[0]!);

    await user.click(screen.getByRole('button', { name: 'Actions for To do' }));

    expect(on.onStatusMenu).toHaveBeenCalledWith(tiles[0]!.status, expect.any(Number), expect.any(Number));
  });

  it('shows why the last change was refused', () => {
    setup(tiles[0]!, { error: 'A status needs a label.' });

    expect(screen.getByRole('alert').textContent).toBe('A status needs a label.');
  });
});
