import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useListNavigation } from './useListNavigation';

interface HarnessProps {
  count: number;
  resetKey?: unknown;
  onEnter?: (index: number) => void;
  onEscape?: () => void;
}

/** An input that reports the hook's selected index. */
function Harness({ count, resetKey, onEnter = vi.fn(), onEscape }: HarnessProps) {
  const { index, setIndex, onKeyDown } = useListNavigation({ count, resetKey, onEnter, onEscape });
  return (
    <>
      <input aria-label="query" onKeyDown={onKeyDown} />
      <output aria-label="index">{index}</output>
      <button type="button" onClick={() => setIndex(2)}>
        pick 2
      </button>
    </>
  );
}

const index = () => screen.getByLabelText('index').textContent;

async function setup(props: HarnessProps) {
  const user = userEvent.setup();
  const view = render(<Harness {...props} />);
  await user.click(screen.getByLabelText('query'));
  return { user, ...view };
}

afterEach(() => {
  cleanup();
});

describe('useListNavigation', () => {
  it('selects the first item', async () => {
    await setup({ count: 3 });

    expect(index()).toBe('0');
  });

  it('moves down and up with the arrow keys', async () => {
    const { user } = await setup({ count: 3 });

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(index()).toBe('2');

    await user.keyboard('{ArrowUp}');
    expect(index()).toBe('1');
  });

  it('wraps around at both ends', async () => {
    const { user } = await setup({ count: 3 });

    await user.keyboard('{ArrowUp}');
    expect(index()).toBe('2');

    await user.keyboard('{ArrowDown}');
    expect(index()).toBe('0');
  });

  it('runs onEnter with the selected index', async () => {
    const onEnter = vi.fn();
    const { user } = await setup({ count: 3, onEnter });

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onEnter).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('does nothing on Enter or the arrows when the list is empty', async () => {
    const onEnter = vi.fn();
    const { user } = await setup({ count: 0, onEnter });

    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');

    expect(index()).toBe('-1');
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('calls onEscape on Escape', async () => {
    const onEscape = vi.fn();
    const { user } = await setup({ count: 3, onEscape });

    await user.keyboard('{Escape}');

    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('closes the window on Escape by default', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const { user } = await setup({ count: 3 });

    await user.keyboard('{Escape}');

    expect(close).toHaveBeenCalledOnce();
  });

  it('goes back to the first item when resetKey changes', async () => {
    const { user, rerender } = await setup({ count: 3, resetKey: 'a' });
    await user.keyboard('{ArrowDown}{ArrowDown}');

    rerender(<Harness count={3} resetKey="b" />);

    expect(index()).toBe('0');
  });

  it('keeps the selection inside the list when it shrinks', async () => {
    const { user, rerender } = await setup({ count: 3 });
    await user.keyboard('{ArrowDown}{ArrowDown}');

    rerender(<Harness count={2} />);

    expect(index()).toBe('1');
  });

  it('lets the caller set the selection', async () => {
    const { user } = await setup({ count: 3 });

    await user.click(screen.getByRole('button', { name: 'pick 2' }));

    expect(index()).toBe('2');
  });

  it('ignores other keys', async () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    const { user } = await setup({ count: 3, onEnter, onEscape });

    await user.keyboard('abc{Tab}');

    expect(index()).toBe('0');
    expect(onEnter).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });
});
