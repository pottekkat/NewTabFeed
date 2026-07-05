import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import '@/assets/tailwind.css';

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
