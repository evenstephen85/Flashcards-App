import React from 'react';
import ReactDOM from 'react-dom/client';

// Provide a localStorage-backed polyfill for window.storage
// MUST be set up before importing App, since App references window.storage
if (!window.storage) {
  window.storage = {
    get: async (key) => {
      const v = localStorage.getItem(key);
      return v ? { value: v } : null;
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
    },
    delete: async (key) => {
      localStorage.removeItem(key);
    },
  };
}

// Dynamic import ensures polyfill is ready before App code executes
import('./App').then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}).catch((err) => {
  document.getElementById('root').innerHTML =
    '<div style="padding:40px;font-family:sans-serif;color:#c00">' +
    '<h2>Failed to load app</h2><pre>' + err.message + '</pre></div>';
  console.error('App failed to load:', err);
});
