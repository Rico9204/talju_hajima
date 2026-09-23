import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
    // 로컬 개발용 — 같은 오리진의 /api 요청을 실제 NestJS 백엔드(제품개발/backend, 기본 3000번
    // 포트)로 넘겨줌. VITE_API_BASE_URL을 지정하면(예: Vercel 배포) 이 프록시 대신 그 주소를 씀.
    proxy: {
      '/api': 'http://localhost:3000',
      // "바로 수정"(실시간 공동편집) 웹소켓 — 백엔드가 /api와 별개로 직접 붙이는 경로라 여기도
      // 따로 프록시해야 로컬 개발에서 연결된다.
      '/collab': { target: 'ws://localhost:3000', ws: true },
    },
  },
  preview: {
    port: parseInt(process.env.PORT || '5173'),
  },
})
