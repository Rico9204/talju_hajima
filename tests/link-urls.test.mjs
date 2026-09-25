// node tests/link-urls.test.mjs <directory containing @electric-sql/pglite>
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.argv[2] || '.', 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select case when auth.uid() is null then 'anon' else 'authenticated' end$$;
grant usage on schema auth,storage to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create function storage.extension(text) returns text language sql as $$select substring($1 from '\\.([^.\\/]+)$')$$;
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
alter default privileges in schema public grant usage on sequences to authenticated;
create publication supabase_realtime;
create schema realtime;
create table realtime.messages(id bigint generated always as identity primary key,extension text,topic text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$select ''$$;
grant usage on schema realtime to authenticated;
`);
await db.exec('set check_function_bodies = off');
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').replace('create extension if not exists pgcrypto;', '').replace(/^alter publication .*;\r?$/gm, ''));
// 기존 위반 데이터가 있어도 마이그레이션은 실패하지 않아야 한다(not valid).
const uid = '00000000-0000-0000-0000-000000000001';
await db.query("insert into auth.users(id,email) values($1,'a@example.test')", [uid]);
await db.exec(`alter table profiles drop constraint profiles_links_urls_ok; update profiles set links='[{"url":"javascript:alert(1)"}]';`);
await db.exec(readFileSync(new URL('../supabase/migrations/2609250000_validate_link_urls.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/2609250100_poll_lock_and_attachment_host.sql', import.meta.url), 'utf8'));
await db.query("update app_text_settings set value='abcdefghijklmnopqrst.supabase.co' where key='storage_host'");
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
await db.exec('set role authenticated');

let count = 0;
async function check(name, fn) { try { await fn(); } catch (error) { console.log('FAIL ' + name); throw error; } console.log('PASS ' + name); count++; }
const setLinks = (links) => db.query('update profiles set links=$1::jsonb where id=$2', [JSON.stringify(links), uid]);
const post = (attachments) => db.query("insert into board_posts(category,title,content,author_user_id,attachments) values('free','t','c',$1,$2::jsonb)", [uid, JSON.stringify(attachments)]);
const STORAGE = 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/board-attachments/u/a.png';

await check('프로필 링크: http(s)만 허용', async () => {
  await setLinks([{ id: '1', type: 'github', label: 'g', url: 'https://github.com/x' }, { id: '2', type: 'web', label: 'w', url: 'http://example.com' }]);
  for (const bad of ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'data:text/html,<script>', 'https://x.com/"onmouseover=1', 'vbscript:x', 'https://', 'mailto:a@b.c']) {
    await assert.rejects(setLinks([{ id: '1', type: 'web', label: 'x', url: bad }]), /profiles_links_urls_ok/, bad);
  }
  await assert.rejects(db.query(`update profiles set links='{"url":"https://a.b"}'::jsonb where id=$1`, [uid]), /profiles_links_urls_ok/);
});
await check('게시글 첨부: 우리 Storage board-attachments 주소만 허용', async () => {
  await post([]);
  await post([{ id: 'a', name: 'a.png', size: '1KB', kind: 'image', url: STORAGE, mimeType: 'image/png' }]);
  for (const bad of [
    'https://evil.com/a.exe', 'javascript:alert(1)',
    'http://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/board-attachments/a',
    'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/workspace-files/a',
    'https://evil.example/storage/v1/object/public/board-attachments/x.exe', // 경로만 흉내 낸 다른 서버
    'https://zzzzzzzzzzzzzzzzzzzz.supabase.co/storage/v1/object/public/board-attachments/x.exe', // 다른 Supabase 프로젝트
    'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/board-attachments/../workspace-files/a',
  ]) {
    await assert.rejects(post([{ id: 'a', name: 'a', kind: 'file', url: bad }]), /board_posts_attachment_urls_ok/, bad);
  }
});
await check('storage_host가 없으면 Supabase 형식 도메인만, 형식이 아니면 거절', async () => {
  await db.exec('reset role');
  await db.exec("delete from app_text_settings where key='storage_host'");
  await db.exec('set role authenticated');
  await post([{ id: 'a', name: 'a', kind: 'file', url: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co/storage/v1/object/public/board-attachments/u/a' }]);
  await assert.rejects(post([{ id: 'a', name: 'a', kind: 'file', url: 'https://evil.example/storage/v1/object/public/board-attachments/x' }]), /board_posts_attachment_urls_ok/);
  await assert.rejects(db.query("insert into app_text_settings(key,value) values('storage_host','evil.example')"), /permission denied/);
});
console.log(count + ' link-url checks passed');
