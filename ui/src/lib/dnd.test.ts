import { describe, expect, it } from 'vitest';

import type { Workspace } from '../api/types';
import { snapshotFixture } from '../test/ipc';
import {
  CACHING,
  CARRIER,
  DONE,
  IN_TEST,
  MONEY,
  ONBOARDING,
  PERSONAL,
  PR_LINK,
  REMOVE_MAP,
  REVIEW,
  STAGING_LINK,
  STANDUP,
  TRABAJO,
  WIKI_LINK,
} from '../test/render';
import { dropCommand } from './dnd';

const workspace = (): Workspace => snapshotFixture().workspace;
const ticket = (id: string) => ({ kind: 'ticket', ticket: id }) as const;
const link = (id: string) => ({ kind: 'link', link: id }) as const;

describe('dropping tickets on lanes', () => {
  it('moves a ticket to the end of another lane and changes its status', () => {
    expect(dropCommand(ticket(ONBOARDING), { kind: 'lane', profile: TRABAJO, status: DONE }, workspace())).toEqual({
      type: 'moveTicket',
      ticket: ONBOARDING,
      place: { profile: TRABAJO },
      index: 2,
      lane: { status: DONE },
    });
  });

  it('reorders within a lane without touching the status, and ignores no-op drops', () => {
    const extra = workspace();
    extra.profiles[0]!.tickets.push({ id: 'x', title: 'Extra', status: IN_TEST });
    expect(dropCommand(ticket('x'), { kind: 'lane', profile: TRABAJO, status: IN_TEST, before: CARRIER }, extra)).toEqual({
      type: 'moveTicket',
      ticket: 'x',
      place: { profile: TRABAJO },
      index: 0,
    });
    expect(dropCommand(ticket(CARRIER), { kind: 'lane', profile: TRABAJO, status: IN_TEST }, workspace())).toBeNull();
    expect(dropCommand(ticket(CARRIER), { kind: 'lane', profile: TRABAJO, status: IN_TEST, before: CARRIER }, workspace())).toBeNull();
  });

  it('takes a sub-ticket out of its parent into the lane', () => {
    expect(dropCommand(ticket(MONEY), { kind: 'lane', profile: TRABAJO, status: REVIEW }, workspace())).toEqual({
      type: 'moveTicket',
      ticket: MONEY,
      place: { profile: TRABAJO },
      index: 2,
      lane: { status: REVIEW },
    });
  });

  it('moves a ticket to another profile when dropped on it', () => {
    expect(dropCommand(ticket(REMOVE_MAP), { kind: 'profile', profile: PERSONAL }, workspace())).toEqual({
      type: 'moveTicket',
      ticket: REMOVE_MAP,
      place: { profile: PERSONAL },
      index: 1,
    });
    expect(dropCommand(ticket(REMOVE_MAP), { kind: 'profile', profile: TRABAJO }, workspace())).toBeNull();
  });

  it('puts a ticket before a sub-ticket as a sibling, unless it has sub-tickets', () => {
    expect(dropCommand(ticket(REMOVE_MAP), { kind: 'beforeSubTicket', ticket: MONEY }, workspace())).toEqual({
      type: 'moveTicket',
      ticket: REMOVE_MAP,
      place: { ticket: CARRIER },
      index: 0,
    });
    expect(dropCommand(ticket(CARRIER), { kind: 'beforeSubTicket', ticket: MONEY }, workspace())).toBeNull();
    expect(dropCommand(ticket(CACHING), { kind: 'beforeSubTicket', ticket: REMOVE_MAP }, workspace())).toBeNull();
  });
});

describe('dropping links and notes', () => {
  it('moves a link into another ticket or note, or before another link', () => {
    expect(dropCommand(link(PR_LINK), { kind: 'linksOf', owner: { note: STANDUP } }, workspace())).toEqual({
      type: 'moveLink',
      link: PR_LINK,
      owner: { note: STANDUP },
      index: 1,
    });
    expect(dropCommand(link(PR_LINK), { kind: 'linksOf', owner: { ticket: CARRIER } }, workspace())).toBeNull();
    expect(dropCommand(link(WIKI_LINK), { kind: 'beforeLink', link: STAGING_LINK }, workspace())).toEqual({
      type: 'moveLink',
      link: WIKI_LINK,
      owner: { ticket: MONEY },
      index: 0,
    });
  });

  it('reorders notes and moves them across profiles', () => {
    expect(dropCommand({ kind: 'note', note: STANDUP }, { kind: 'profile', profile: PERSONAL }, workspace())).toEqual({
      type: 'moveNote',
      note: STANDUP,
      profile: PERSONAL,
      index: 0,
    });
    expect(dropCommand({ kind: 'note', note: STANDUP }, { kind: 'notes', profile: TRABAJO, before: STANDUP }, workspace())).toBeNull();
  });

  it('pins on the pinned section and reorders pinned items', () => {
    const pinned = { ...workspace(), pinned: [{ ticket: CARRIER }, { link: PR_LINK }] };
    expect(dropCommand(ticket(REMOVE_MAP), { kind: 'pinned' }, pinned)).toEqual({ type: 'pin', target: { ticket: REMOVE_MAP } });
    expect(dropCommand(link(PR_LINK), { kind: 'pinned', before: { ticket: CARRIER } }, pinned)).toEqual({
      type: 'movePinned',
      target: { link: PR_LINK },
      index: 0,
    });
    expect(dropCommand({ kind: 'profile', profile: TRABAJO }, { kind: 'pinned' }, pinned)).toBeNull();
  });
});
