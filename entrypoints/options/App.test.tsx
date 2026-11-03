import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { StatusBuilder } from '@/__mocks__/status.builder';
import { StatusMother } from '@/__mocks__/status.mother';
import { statusesItem } from '@/lib/statuses';
import App from './App';

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  cleanup();
});

const rowLabels = () =>
  screen
    .getAllByRole('textbox', { name: /^Label of / })
    .map((input) => (input as HTMLInputElement).value);

describe('App', () => {
  it('says "Loading statuses…" before the first read', () => {
    render(<App />);

    expect(screen.getByText('Loading statuses…')).toBeTruthy();
  });

  it('shows the heading and the 8 default statuses', async () => {
    render(<App />);

    await screen.findByRole('region', { name: 'Statuses' });
    expect(screen.getByRole('heading', { name: 'Statuses' })).toBeTruthy();
    expect(rowLabels()).toEqual(StatusMother.defaults().map((status) => status.label));
  });

  it('follows changes saved elsewhere', async () => {
    render(<App />);
    await screen.findByRole('region', { name: 'Statuses' });

    await statusesItem.setValue([new StatusBuilder().build()]);

    expect(await screen.findByDisplayValue('QA')).toBeTruthy();
    expect(rowLabels()).toEqual(['QA']);
  });
});
