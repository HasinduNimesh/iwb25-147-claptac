import React from 'react';
import { createRoot } from 'react-dom/client';
import LankaWatteWiseApp from './ui-wrapper';
import { AuthProvider } from './AuthContext';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element with id "root" was not found in the document.');
}

createRoot(container).render(
  <React.StrictMode>
    <AuthProvider>
      <LankaWatteWiseApp />
    </AuthProvider>
  </React.StrictMode>
);
