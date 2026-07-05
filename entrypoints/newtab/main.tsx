import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import '@/assets/tailwind.css';

// Follow the OS light/dark preference by toggling the `.dark` class that the
// shadcn theme tokens key off of. Phase 2 will replace this with an explicit
// theme setting; for now the placeholder simply mirrors the system.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function syncTheme() {
  document.documentElement.classList.toggle('dark', darkQuery.matches);
}
syncTheme();
darkQuery.addEventListener('change', syncTheme);

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
