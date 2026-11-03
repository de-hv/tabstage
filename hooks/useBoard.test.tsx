import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BoardMother } from '@/__mocks__/board.mother';
import { boardItem } from '@/lib/board';
import { useBoard } from './useBoard';

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  cleanup();
});

describe('useBoard', () => {
  it('is undefined until the first read, then returns the stored board', async () => {
    await boardItem.setValue(BoardMother.sample());

    const { result } = renderHook(() => useBoard());

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual(BoardMother.sample()));
  });

  it('returns an empty board when nothing is stored', async () => {
    const { result } = renderHook(() => useBoard());

    await waitFor(() => expect(result.current).toEqual(BoardMother.empty()));
  });

  it('follows changes saved elsewhere', async () => {
    const { result } = renderHook(() => useBoard());
    await waitFor(() => expect(result.current).toBeDefined());

    await boardItem.setValue(BoardMother.sample());

    await waitFor(() => expect(result.current?.items).toHaveLength(4));
  });
});
