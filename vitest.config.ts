import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

const exclude = ['node_modules', '.output', '.wxt'];

// Each project loads WxtVitest itself: the plugin's setup (fake browser,
// `#imports`) does not reach projects from the root config.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [WxtVitest()],
        test: { name: 'unit', include: ['**/*.test.ts'], exclude, restoreMocks: true },
      },
      {
        // Hooks and components render in a DOM.
        plugins: [WxtVitest()],
        test: {
          name: 'dom',
          include: ['**/*.test.tsx'],
          exclude,
          restoreMocks: true,
          environment: 'happy-dom',
        },
      },
    ],
  },
});
