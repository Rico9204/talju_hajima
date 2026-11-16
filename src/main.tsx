import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { reloadForNewVersion } from './components/ErrorBoundary'
import './index.css'

// A new Vercel deploy replaces hashed chunk files; a tab left open across a
// deploy can still try to lazy-load a chunk that no longer exists ("Failed
// to fetch dynamically imported module"). Vite fires this event for exactly
// that case — reload once to pick up the current build instead of leaving
// the user stuck on a broken import.
// 1분 안에 다시 실패하면(파일이 정말 없는 경우) 새로 고침을 반복하지 않고, 오류를 그대로 흘려 ErrorBoundary가 안내하게 한다.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})

// 서비스 워커(public/sw.js): 웹 푸시 수신용.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
