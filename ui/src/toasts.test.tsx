import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Toasts } from './components/Toasts';

describe('notices', () => {
  it('stacks notices, newest last, and dismisses one with its button', async () => {
    const onDismiss = vi.fn();
    render(
      <Toasts
        notices={[
          { id: 1, text: 'Already open in Safari' },
          { id: 2, text: 'Link copied' },
        ]}
        onDismiss={onDismiss}
      />,
    );

    const items = screen.getAllByRole('listitem').map((toast) => toast.textContent);
    expect(items).toEqual(['Already open in Safari', 'Link copied']);

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[1]!);
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith(2));
  });
});
