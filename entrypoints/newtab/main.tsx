import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import '@/assets/tailwind.css';

// One-shot pre-paint default: match the OS preference so the very first frame
// isn't a light flash on a dark system. This does NOT install a listener—the
// real, setting-aware theming (including 'light'/'dark' overrides and live OS
// changes) is owned by `useTheme` once the stored theme loads.
document.documentElement.classList.toggle(
  'dark',
  window.matchMedia('(prefers-color-scheme: dark)').matches,
);

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
