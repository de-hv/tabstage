import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '@/lib/panel-menus';
import { ContextMenu } from './ContextMenu';

afterEach(() => {
  cleanup();
});

function items(): { menu: MenuItem[]; rename: () => void; done: () => void; remove: () => void } {
  const rename = vi.fn();
  const done = vi.fn();
  const remove = vi.fn();
  return {
    rename,
    done,
    remove,
    menu: [
      { id: 'rename', label: 'Rename', onSelect: rename },
      { id: 'off', label: 'Open all', disabled: true },
      {
        id: 'move',
        label: 'Move to status',
        submenu: [
          { id: 'todo', label: 'To do (current)', disabled: true },
          { id: 'done', label: 'Done', onSelect: done, color: 'green' },
        ],
      },
      { id: 'remove', label: 'Remove from Tabstage', danger: true, onSelect: remove },
    ],
  };
}

function setup() {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const data = items();
  render(
    <>
      <button type="button">trigger</button>
      <ContextMenu label="Actions for PR" items={data.menu} x={10} y={10} onClose={onClose} />
    </>,
  );
  return { user, onClose, ...data };
}

const focused = () => (document.activeElement as HTMLElement).textContent?.trim();

describe('ContextMenu', () => {
  it('renders a labelled menu and focuses the first entry', () => {
    setup();

    expect(screen.getByRole('menu', { name: 'Actions for PR' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Rename',
      'Open all',
      'Move to status▸',
      'Remove from Tabstage',
    ]);
    expect(focused()).toBe('Rename');
  });

  it('moves with the arrows, skipping disabled entries and wrapping', async () => {
    const { user } = setup();

    await user.keyboard('{ArrowDown}');
    expect(focused()).toBe('Move to status▸');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(focused()).toBe('Rename');
    await user.keyboard('{ArrowUp}');
    expect(focused()).toBe('Remove from Tabstage');
    await user.keyboard('{Home}');
    expect(focused()).toBe('Rename');
    await user.keyboard('{End}');
    expect(focused()).toBe('Remove from Tabstage');
  });

  it('runs an entry with Enter and closes', async () => {
    const { user, rename, onClose } = setup();

    await user.keyboard('{Enter}');

    expect(rename).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens a submenu with → and goes back with ←', async () => {
    const { user } = setup();

    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getByRole('menu', { name: 'Move to status' })).toBeTruthy();
    expect(focused()).toBe('Done');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('menu', { name: 'Actions for PR' })).toBeTruthy();
    expect(focused()).toBe('Move to status▸');
  });

  it('runs a submenu entry', async () => {
    const { user, done } = setup();

    await user.click(screen.getByRole('menuitem', { name: /Move to status/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Done' }));

    expect(done).toHaveBeenCalledOnce();
  });

  it('goes back from a submenu with the back entry and with Escape', async () => {
    const { user, onClose } = setup();

    await user.click(screen.getByRole('menuitem', { name: /Move to status/ }));
    await user.click(screen.getByRole('menuitem', { name: /Move to status/ }));
    expect(screen.getByRole('menu', { name: 'Actions for PR' })).toBeTruthy();

    await user.keyboard('{ArrowRight}{Escape}');
    expect(screen.getByRole('menu', { name: 'Actions for PR' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape and gives focus back', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const Wrapper = () => <button type="button">trigger</button>;
    const { rerender } = render(<Wrapper />);
    screen.getByRole('button', { name: 'trigger' }).focus();
    rerender(
      <>
        <Wrapper />
        <ContextMenu label="Menu" items={items().menu} x={0} y={0} onClose={onClose} />
      </>,
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'trigger' }));
  });

  it('does nothing on a disabled entry', async () => {
    const { user, onClose } = setup();

    await user.click(screen.getByRole('menuitem', { name: 'Open all' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a click outside', async () => {
    const { user, onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'trigger' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Tab', async () => {
    const { user, onClose } = setup();

    await user.keyboard('{Tab}');

    expect(onClose).toHaveBeenCalledOnce();
  });
});
