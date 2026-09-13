import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchMajorsFromApi } from './api/_lib/majors'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Mirrors api/majors.ts (the real Vercel serverless function) so
        // /api/majors also works against `pnpm run dev` locally.
        name: 'majors-dev-proxy',
        apply: 'serve' as const,
        configureServer(server) {
          const cache = new Map<string, { majors: string[]; cachedAt: number }>()
          const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour in dev

          server.middlewares.use('/api/majors', async (req, res) => {
            const url = new URL(req.url ?? '', 'http://localhost')
            const school = (url.searchParams.get('school') ?? '').trim()
            if (!school) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'school query param is required' }))
              return
            }

            const apiKey = env.ODCLOUD_API_KEY
            if (!apiKey) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'ODCLOUD_API_KEY not set in .env.local' }))
              return
            }

            const cached = cache.get(school)
            if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ majors: cached.majors }))
              return
            }

            try {
              const majors = await fetchMajorsFromApi(school, apiKey)
              cache.set(school, { majors, cachedAt: Date.now() })
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ majors }))
            } catch (err) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'fetch failed' }))
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
