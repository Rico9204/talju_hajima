import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// StrictMode를 일부러 안 쓴다 — 개발 모드에서 마운트 직후 모든 effect를 정리→재실행하는 동작이
// 이 앱의 실시간 공동편집(Yjs+y-websocket) 세션 관리와 맞물려 실제 버그를 두 번이나 만들었다
// (ydoc이 정리 단계에서 destroy()돼 그 뒤 편집 내용이 저장 안 되던 버그, 그리고 연결을 끄고
// 다시 켜는 그 순간 소켓이 잠깐 중복으로 열려 편집창을 닫아도 서버가 계속 "접속 중"으로 보던
// 버그). 둘 다 프로덕션 빌드에서는 StrictMode 자체가 없어 애초에 일어나지 않는 문제였다 —
// StrictMode가 잡아주는 "순수하지 않은 렌더" 경고보다, 이 반복되는 실사용 버그 쪽 비용이 커서
// 껐다.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
