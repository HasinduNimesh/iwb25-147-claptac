import React from 'react'
import { createRoot } from 'react-dom/client'
import EcoMeterApp from './ui.jsx'
import { AuthProvider } from './AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
  <EcoMeterApp />
    </AuthProvider>
  </React.StrictMode>
)
