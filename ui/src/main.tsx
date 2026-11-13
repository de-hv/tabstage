import './styles/theme.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { suppressNativeContextMenu } from './lib/nativeMenu';

suppressNativeContextMenu();

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
