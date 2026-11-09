import { clearMocks } from '@tauri-apps/api/mocks';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(async () => {
  cleanup();
  // Unmounting stops event listeners asynchronously (`unlisten` is a
  // promise). Let that finish while the mocked event system still exists.
  await new Promise((resolve) => setTimeout(resolve, 0));
  clearMocks();
  localStorage.clear();
});
