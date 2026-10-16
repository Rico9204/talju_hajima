import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Vite config — https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // api/campus-notices.js(Vercel 함수)를 `pnpm run dev`에서도 쓰도록 같은 수집기를 붙인다.
        // 나머지 /api는 자체 서버(VITE_API_URL)가 맡는다.
        name: 'campus-notices-dev',
        apply: 'serve' as const,
        configureServer(server) {
          const noticeCache = new Map<string, { result: any; cachedAt: number }>()
          const NOTICE_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes cache in dev

          server.middlewares.use('/api/campus-notices', async (req, res) => {
            try {
              const url = new URL(req.url ?? '', 'http://localhost')
              const school = (url.searchParams.get('school') ?? '').trim()
              const category = (url.searchParams.get('category') ?? 'all') as any
              const cacheKey = `${school}:${category}`

              const cached = noticeCache.get(cacheKey)
              if (cached && Date.now() - cached.cachedAt < NOTICE_CACHE_TTL_MS) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(cached.result))
                return
              }

              const { crawlNotices } = await import('./src/lib/crawler/crawlerService')
              const result = await crawlNotices(school, category)
              noticeCache.set(cacheKey, { result, cachedAt: Date.now() })

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'crawl failed' }))
            }
          })
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: parseInt(process.env.PORT || '5173'),
    },
    preview: {
      port: parseInt(process.env.PORT || '5173'),
    },
  }
})
