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
    },
  },
  preview: {
    port: parseInt(process.env.PORT || '5173'),
  },
})
