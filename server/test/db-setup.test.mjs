import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('새 DB에서 전방 참조가 있는 전체 스키마를 로드하고 채팅 제약조건을 재적용한다', async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(new URL('../db/bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec('set check_function_bodies = off');
    const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8')
      .replace('create extension if not exists pgcrypto;', '')
      .replace(/^alter publication .*;\r?$/gm, '');
    await db.exec(schema);
    await db.exec(readFileSync(new URL('../db/realtime.sql', import.meta.url), 'utf8'));
    await db.exec('set check_function_bodies = on');
    const result = await db.query('select public.evaluation_prototype_enabled() as enabled');
    assert.equal(typeof result.rows[0].enabled, 'boolean');
    const migration = readFileSync(new URL('../../supabase/migrations/2609270400_chat_unique_retry.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const constraints = await db.query("select count(*)::int as count from pg_constraint where conrelid='public.chat_messages'::regclass and conname='chat_messages_id_project_unique'");
    assert.equal(constraints.rows[0].count, 1);
  } finally { await db.close(); }
});
