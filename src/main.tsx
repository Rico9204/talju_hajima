import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// A new Vercel deploy replaces hashed chunk files; a tab left open across a
// deploy can still try to lazy-load a chunk that no longer exists ("Failed
// to fetch dynamically imported module"). Vite fires this event for exactly
// that case — reload once to pick up the current build instead of leaving
// the user stuck on a broken import.
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
