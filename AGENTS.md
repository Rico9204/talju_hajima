# 온라인 팀플 협업 플랫폼

React + Vite + Tailwind CSS project, backed by Supabase (Postgres) for data.

## Development Server

Start the dev server with `pnpm run dev`. It listens on `$PORT` (default 5173). Use pnpm only (no `npm install`; there is no `package-lock.json`).

- Hot reload: Changes to source files are reflected immediately
- Requires `.env.local` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (copy `.env.example`); `ODCLOUD_API_KEY` is optional (school → majors lookup). Without the Supabase values the app shows an on-screen setup message instead of crashing.
- Database: a **new** Supabase project gets `supabase/schema.sql` (+ optionally `supabase/seed.sql`). An **existing** project gets only the new files in `supabase/migrations/`, applied in filename order. See `supabase/DEPLOYMENT.md`.

## Database changes

- Add every schema change as a new timestamped file `supabase/migrations/YYMMDDHHMM_name.sql` (see `supabase/migrations/README.md`) **and** append the same change to the end of `supabase/schema.sql`, so both paths stay equivalent.
- Migrations must be safe to run on an already deployed project (`if not exists`, `create or replace`, `drop policy if exists`).
- Writes that need validation go through `security definer` RPCs; RLS policies only allow direct reads (and direct writes that need no validation).
- Vite env changes on Vercel need a Redeploy to take effect.

## Tests

- `pnpm test` runs every `tests/*.test.mjs` (Node test runner). Database tests run `supabase/schema.sql` inside PGlite (`@electric-sql/pglite`), so a schema change is covered without a live Supabase project.
- A new RPC or RLS rule should come with a PGlite test (copy the header of `tests/board-report-server.test.mjs`).
- `tests/preview-*.mjs` + `tests/fixtures/` are manual UI previews, not part of `pnpm test`.

## Data Layer

The app never calls Supabase directly from components. `src/api/dataRepository.ts` defines a `DataRepository` interface; `src/api/supabase/supabaseDataRepository.ts` is the only implementation today, wired up in `src/api/index.ts`. `src/context/ProjectContext.tsx` is the sole consumer — it fetches through `dataRepository` and exposes `useProject()` to components. To move to a self-hosted DB server later, implement `DataRepository` against your own API and swap the one export in `src/api/index.ts`; no component changes needed.

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and test (`pnpm test`) scripts
- `vite.config.ts` - Vite configuration with React and Tailwind CSS v4 plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm
- `src/api/` - Backend-agnostic data layer (`DataRepository` interface + the Supabase implementation)
- `src/lib/supabase.ts` - Supabase client singleton, reads `VITE_SUPABASE_*` env vars
- `supabase/schema.sql`, `supabase/seed.sql` - full baseline DDL and sample data for a new Supabase project
- `supabase/migrations/` - incremental changes for existing projects, applied in filename order
- `supabase/verify_runtime.sql` - read-only post-deploy check (every `ready` must be true)
- `api/majors.ts` - Vercel serverless function for `/api/majors` (mirrored in `vite.config.ts` for local dev)
- `tests/` - Node test runner tests (`pnpm test`)

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Data: `@supabase/supabase-js`, `react-router-dom` 7, `yjs` (collaborative editing), `pdfjs-dist` / `officeparser` (workspace text extraction, loaded lazily)
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
