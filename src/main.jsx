import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Provide a localStorage-backed polyfill for window.storage
// (the App uses window.storage for persistence)
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
