import { describe, expect, it } from 'vitest';

import { readableUrl, ticketLink } from './urls';

describe('readableUrl', () => {
  it('keeps the whole path of a Jira ticket, with the ticket as the tail', () => {
    expect(readableUrl('https://jira.example.com/browse/PROJ-1182')).toEqual({
      host: 'jira.example.com',
      head: '/browse/',
      tail: 'PROJ-1182',
    });
  });

  it('shows a bare domain without scheme or trailing slash', () => {
    expect(readableUrl('https://status.example.com/')).toEqual({ host: 'status.example.com', head: '', tail: '' });
  });

  it('drops www.', () => {
    expect(readableUrl('https://www.example.com/docs')).toEqual({ host: 'example.com', head: '/', tail: 'docs' });
  });

  it('keeps the value of the last query parameter visible', () => {
    expect(readableUrl('https://grafana.example.com/d/api?orgId=1&from=now-6h&var-env=qa')).toEqual({
      host: 'grafana.example.com',
      head: '/d/api?orgId=1&from=now-6h&var-env=',
      tail: 'qa',
    });
    expect(readableUrl('https://acme.atlassian.net/jira/boards/12?selectedIssue=PROJ-1182')).toEqual({
      host: 'acme.atlassian.net',
      head: '/jira/boards/12?selectedIssue=',
      tail: 'PROJ-1182',
    });
    expect(readableUrl('https://a.dev/list?flag')).toEqual({ host: 'a.dev', head: '/list', tail: '?flag' });
  });

  it('keeps hash routes', () => {
    expect(readableUrl('https://app.example.com/#/projects/42')).toEqual({
      host: 'app.example.com',
      head: '/#/projects/',
      tail: '42',
    });
  });

  it('keeps ports', () => {
    expect(readableUrl('http://127.0.0.1:8080/health')).toEqual({ host: '127.0.0.1:8080', head: '/', tail: 'health' });
  });

  it('shows what it cannot parse as is', () => {
    expect(readableUrl('not a url')).toEqual({ host: '', head: 'not a url', tail: '' });
  });
});

describe('ticketLink', () => {
  it('puts the encoded ticket id in place of {ticket}', () => {
    expect(ticketLink('https://jira.dev/browse/{ticket}', 'PROJ-1')).toBe('https://jira.dev/browse/PROJ-1');
    expect(ticketLink('https://x.dev/?q={ticket}', 'a b/ñ')).toBe('https://x.dev/?q=a%20b%2F%C3%B1');
  });

  it('is undefined without a template or a ticket', () => {
    expect(ticketLink(undefined, 'PROJ-1')).toBeUndefined();
    expect(ticketLink('https://jira.dev/{ticket}', undefined)).toBeUndefined();
  });
});
