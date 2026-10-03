# 온라인 팀플 협업 플랫폼

React + Vite + Tailwind CSS project. Data, login and file storage come from the self-hosted NestJS API server in `server/`, which runs on plain PostgreSQL. The project no longer uses Supabase at runtime. The `supabase/` folder name is kept because it holds the database schema the server applies.

## Development Server

Start the dev server with `pnpm run dev`. It listens on `$PORT` (default 5173). Use pnpm only (no `npm install`; there is no `package-lock.json`).

- Hot reload: Changes to source files are reflected immediately
- Requires `.env.local` with `VITE_API_URL` (copy `.env.example`), plus a running API server. See `server/README.md`: Docker Postgres from `server/docker-compose.yml`, `server/.env`, and `pnpm run dev` or `dev:ngrok` in `server/`.
- Production: Vercel serves the frontend, and `vercel.json` forwards `/api/*` to the server on the developer's PC through a fixed ngrok domain. Set `VITE_API_URL=/api` and `VITE_BACKEND_URL=<ngrok origin>` on Vercel. Realtime (WebSocket) traffic and public file links go to `VITE_BACKEND_URL` directly.
- Database: a **new** database gets `pnpm run db:setup` in `server/` (`server/db/bootstrap.sql` + `supabase/schema.sql`). An **existing** database gets only the new files in `supabase/migrations/`, applied in filename order.
- Backups: `pnpm run backup` in `server/` (DB dump + uploaded files).

## Database changes

- Add every schema change as a new timestamped file `supabase/migrations/YYMMDDHHMM_name.sql` (see `supabase/migrations/README.md`) **and** append the same change to the end of `supabase/schema.sql`, so both paths stay equivalent.
- Migrations must be safe to run on an already deployed project (`if not exists`, `create or replace`, `drop policy if exists`).
- Writes that need validation go through `security definer` RPCs; RLS policies only allow direct reads (and direct writes that need no validation).
- Vite env changes on Vercel need a Redeploy to take effect. Server code or `server/.env` changes need a server restart instead.

## Tests

- `pnpm test` runs every `tests/*.test.mjs` (Node test runner). Database tests run `supabase/schema.sql` inside PGlite (`@electric-sql/pglite`), so a schema change is covered without a live database.
- A new RPC or RLS rule should come with a PGlite test (copy the header of `tests/board-report-server.test.mjs`).
- `tests/preview-*.mjs` + `tests/fixtures/` are manual UI previews, not part of `pnpm test`.
- `pnpm --dir server test` builds and tests the API server (PGlite with `server/db/bootstrap.sql` + `supabase/schema.sql`, the real Nest app over HTTP, real signup/login tokens). Install it separately with `pnpm --dir server install --ignore-workspace`. If pnpm at the repo root creates a `pnpm-workspace.yaml`, delete it. It can make the next server command reinstall and empty `server/node_modules`. The direct equivalents are `npx tsc --noEmit -p .`, `npx vite build` and `node --test "tests/*.test.mjs"` at the root, and `./node_modules/.bin/tsc -p tsconfig.json && node --test test/*.test.mjs` in `server/`.

## Data Layer

Components never call the server directly. `src/api/dataRepository.ts` defines a `DataRepository` interface. `src/api/rest/restDataRepository.ts` implements it over the API server, and `src/api/index.ts` wires it up. `src/context/ProjectContext.tsx` fetches through `dataRepository` and exposes `useProject()` to components. Login state lives in `src/context/AuthContext.tsx` and `src/api/rest/` (`authApi.ts`, `session.ts`). The access token is kept in memory only, and the refresh token is an httpOnly cookie.

The server (`server/`, NestJS; see `server/README.md`) does its own login (bcrypt + its own JWT, refresh tokens). `server/db/bootstrap.sql` recreates the minimal Supabase platform pieces (roles, `auth.users`, `auth.uid()`, storage/realtime tables), so `supabase/schema.sql` applies unchanged. Every query runs **as the signed-in user** (`set local role authenticated` + `auth.uid()`), so the RLS policies and DB functions enforce all permissions. Do not re-implement permission checks in server code. To add a feature: endpoint in `server/src/`, test in `server/test/`, then a `DataRepository` method in `restDataRepository.ts`.

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and test (`pnpm test`) scripts
- `vite.config.ts` - Vite configuration with React and Tailwind CSS v4 plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm
- `src/api/` - Data layer (`DataRepository` interface + the REST implementation and session handling in `src/api/rest/`)
- `src/context/AuthContext.tsx` - Login state; `src/context/ProjectContext.tsx` - data for components
- `supabase/schema.sql`, `supabase/seed.sql` - full baseline DDL and sample data for a new database
- `supabase/migrations/` - incremental changes for existing databases, applied in filename order
- `supabase/verify_runtime.sql` - read-only post-deploy check (every `ready` must be true)
- `api/campus-notices.js` - Vercel function for `/api/campus-notices` (no login), a committed bundle of `src/server/campus-notices.ts` + `src/lib/crawler/`. Rebuild it after changing those files. `vite.config.ts` serves the same route in `pnpm run dev`. School → majors lookup is a server endpoint (`server/src/majors.ts`, `ODCLOUD_API_KEY` in `server/.env`).
- `vercel.json` - forwards `/api/*` to the ngrok domain (keep it equal to `NGROK_URL` in `server/.env`)
- `tests/` - Node test runner tests (`pnpm test`)
- `server/` - self-hosted NestJS API server on plain PostgreSQL (separate pnpm package, not deployed by Vercel); `server/README.md` lists endpoints, setup and the ngrok deployment

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Data: `react-router-dom` 7, `yjs` + Tiptap (collaborative editing), `pdfjs-dist` / `officeparser` (workspace text extraction, loaded lazily)
- Server (`server/package.json`, installed separately): NestJS, `pg`, `bcryptjs`, `jose` (JWT)
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Tests: Node test runner + `@electric-sql/pglite`
- Formatting: no auto-formatter (oxfmt was removed because it corrupted syntax repo-wide); match the surrounding code style by hand

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.
- Board post bodies are stored as raw HTML: always render them through `sanitizeBoardHtml` (`src/lib/boardHtml.ts`), never directly via `innerHTML` / `dangerouslySetInnerHTML`.
- Type-check with `npx tsc --noEmit -p .` and run `pnpm run build` and `pnpm test` before committing.
