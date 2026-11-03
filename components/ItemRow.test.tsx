import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemBuilder } from '@/__mocks__/item.builder';
import type { BoardItem } from '@/lib/types';
import { ItemRow } from './ItemRow';

afterEach(() => {
  cleanup();
});

function setup(item: BoardItem) {
  const user = userEvent.setup();
  const on = { onOpen: vi.fn(), onRemove: vi.fn(), onMenu: vi.fn() };
  render(
    <ul>
      <ItemRow item={item} {...on} />
    </ul>,
  );
  return { user, ...on };
}

describe('ItemRow', () => {
  it('shows an open tab with its favicon and focuses it on click', async () => {
    const item = new ItemBuilder().build();
    const { user, onOpen } = setup(item);

    await user.click(screen.getByRole('button', { name: 'CAR-6124 · Login fix' }));

    expect(onOpen).toHaveBeenCalledWith(item);
    expect(document.querySelector('img')?.getAttribute('src')).toBe(item.favIconUrl);
    expect(screen.queryByText('closed')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it('shows a closed link dimmed, reopens it on click and removes it with ✕', async () => {
    const item = new ItemBuilder().closed().build();
    const { user, onOpen, onRemove } = setup(item);

    expect(screen.getByRole('listitem').getAttribute('data-closed')).toBe('true');
    expect(screen.getByText('closed')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /closed, click to reopen/ }));
    await user.click(screen.getByRole('button', { name: 'Remove CAR-6124 · Login fix' }));

    expect(onOpen).toHaveBeenCalledWith(item);
    expect(onRemove).toHaveBeenCalledWith(item);
  });

  it('shows a placeholder when there is no favicon or it fails to load', () => {
    setup(new ItemBuilder().build());
    fireEvent.error(document.querySelector('img')!);

    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('.item__favicon--none')).toBeTruthy();
  });

  it('opens the menu on right-click at the pointer', () => {
    const item = new ItemBuilder().build();
    const { onMenu } = setup(item);

    fireEvent.contextMenu(screen.getByRole('button'), { clientX: 40, clientY: 50 });

    expect(onMenu).toHaveBeenCalledWith(item, 40, 50);
  });

  it.each([['{ContextMenu}'], ['{Shift>}{F10}{/Shift}']])('opens the menu from the keyboard with %s', async (keys) => {
    const item = new ItemBuilder().build();
    const { user, onMenu } = setup(item);
    screen.getByRole('button').focus();

    await user.keyboard(keys);

    expect(onMenu).toHaveBeenCalledWith(item, expect.any(Number), expect.any(Number));
  });
});
