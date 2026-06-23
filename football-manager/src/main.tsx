import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './i18n'
import { applyTheme, getStoredTheme } from './lib/theme'
import { applyStoredVisualSkin } from './lib/visualSkin'

applyTheme(getStoredTheme())
applyStoredVisualSkin()

// Cleanup legacy API cache
if ('caches' in window) {
  caches.keys().then((names) => {
    for (const name of names) {
      if (name === 'api-cache') {
        caches.delete(name);
      }
    }
  });
}

import { Toaster } from 'react-hot-toast'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="bottom-right" />
    </BrowserRouter>
  </React.StrictMode>,
)
