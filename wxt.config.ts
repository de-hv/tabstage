import { defineConfig } from 'wxt';

const GECKO_ID = 'tabstage@de-hv';
const FIREFOX_MIN_VERSION = '140.0';
/** `@wxt-dev/auto-icons` writes `icons/<size>.png` for each size. */
const ICON_SIZES = [16, 32, 48, 96, 128];
const ACTION_ICONS = Object.fromEntries(
  [16, 32, 48].map((size) => [size, `icons/${size}.png`]),
);

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
    sizes: ICON_SIZES,
  },
  // WXT builds Firefox as MV2 by default; tabstage targets MV3 everywhere.
  manifestVersion: 3,
  manifest: ({ browser }) => {
    const isFirefox = browser === 'firefox';

    return {
      name: 'Tabstage',
      description: 'Editable statuses for the tabs you choose, in a tiled side panel.',
      // WXT adds `sidePanel` on Chrome MV3 and maps the side panel to
      // `sidebar_action` on Firefox, so it is not listed here. Firefox names
      // the context menu permission `menus` (with the `tab` context).
      permissions: ['tabs', 'storage', isFirefox ? 'menus' : 'contextMenus'],
      // Requested only by the opt-in cleanup of v1 titles in Options. Nothing
      // else touches native tab groups.
      optional_permissions: ['tabGroups'],
      // No popup: the icon opens and closes the panel.
      action: { default_icon: ACTION_ICONS, default_title: 'Toggle Tabstage' },
      commands: {
        'open-palette': {
          suggested_key: { default: 'Alt+Shift+K', mac: 'Command+Shift+K' },
          description: 'Open the Tabstage panel with the command palette',
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
