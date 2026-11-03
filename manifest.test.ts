import { describe, expect, it } from 'vitest';
import config from './wxt.config';

type Manifest = {
  permissions?: string[];
  optional_permissions?: string[];
  action?: { default_popup?: string };
  commands?: Record<string, unknown>;
};

function manifest(browser: 'chrome' | 'firefox'): Manifest {
  const build = config.manifest as (env: { browser: string }) => Manifest;
  return build({ browser });
}

describe('manifest', () => {
  it.each(['chrome', 'firefox'] as const)('asks for no tabGroups permission on %s', (browser) => {
    const { permissions, optional_permissions } = manifest(browser);

    expect(permissions).not.toContain('tabGroups');
    expect(optional_permissions).toEqual(['tabGroups']);
  });

  it('uses contextMenus on Chrome and menus on Firefox', () => {
    expect(manifest('chrome').permissions).toEqual(['tabs', 'storage', 'contextMenus']);
    expect(manifest('firefox').permissions).toEqual(['tabs', 'storage', 'menus']);
  });

  it.each(['chrome', 'firefox'] as const)('has no popup on %s', (browser) => {
    expect(manifest(browser).action?.default_popup).toBeUndefined();
  });

  it('binds the palette and panel shortcuts', () => {
    expect(Object.keys(manifest('chrome').commands ?? {})).toEqual(['open-palette', 'toggle-panel']);
    expect(Object.keys(manifest('firefox').commands ?? {})).toEqual(['open-palette', '_execute_sidebar_action']);
  });
});
