import React from 'react'
import { createRoot } from 'react-dom/client'
import LankaWatteWiseApp from './ui.jsx'
import { AuthProvider } from './AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
  <LankaWatteWiseApp />
    </AuthProvider>
  </React.StrictMode>
)
