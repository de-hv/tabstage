import { defineConfig } from 'wxt';

const GECKO_ID = 'tabstage@de-hv';
const FIREFOX_MIN_VERSION = '140.0';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // WXT builds Firefox as MV2 by default; tabstage targets MV3 everywhere.
  manifestVersion: 3,
  manifest: ({ browser }) => {
    const isFirefox = browser === 'firefox';

    return {
      name: 'Tabstage',
      description: 'Jira-like statuses for native tab groups.',
      // WXT adds `sidePanel` on Chrome MV3 and maps the side panel to
      // `sidebar_action` on Firefox, so it is not listed here.
      permissions: ['tabs', 'tabGroups', 'storage'],
      commands: {
        _execute_action: {
          suggested_key: { default: 'Alt+Shift+K', mac: 'Command+Shift+K' },
        },
        ...(isFirefox
          ? {
              _execute_sidebar_action: {
                suggested_key: { default: 'Alt+Shift+L' },
              },
            }
          : {
              'toggle-panel': {
                suggested_key: { default: 'Alt+Shift+L' },
                description: 'Toggle the Tabstage side panel',
              },
            }),
      },
      ...(isFirefox && {
        browser_specific_settings: {
          gecko: {
            id: GECKO_ID,
            strict_min_version: FIREFOX_MIN_VERSION,
            data_collection_permissions: { required: ['none'] },
          },
        },
      }),
    };
  },
});
