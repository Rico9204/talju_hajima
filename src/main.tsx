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

// 서비스 워커(public/sw.js): 웹 푸시 + ngrok 백엔드의 이미지가 경고 페이지로 깨지지 않게 하는 헤더.
// 처음 설치될 때는 이미 요청한 이미지가 깨져 있을 수 있어, 워커가 화면을 맡는 순간 깨진 이미지만 다시 불러온다.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) return
    document.querySelectorAll('img').forEach((img) => {
      if (img.src && img.complete && img.naturalWidth === 0) img.src = img.src
    })
  })
  void navigator.serviceWorker.register('/sw.js').catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
