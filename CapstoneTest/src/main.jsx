// src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/authcontext';
import './index.css';

// Apply persisted theme before React mounts to avoid flash-of-unstyled-content
try {
  const persisted = localStorage.getItem('theme');
  if (persisted === 'dark') {
    document.documentElement.classList.add('dark');
  } else if (persisted === 'light') {
    document.documentElement.classList.remove('dark');
  }
} catch (e) {
  // ignore (e.g., SSR or localStorage disabled)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
