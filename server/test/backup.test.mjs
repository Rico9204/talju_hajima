import test from 'node:test';
import assert from 'node:assert/strict';
import { backupStamp, dbTarget, expiredBackups } from '../scripts/backup-lib.mjs';

test('DATABASE_URL에서 pg_dump 대상(사용자·DB)을 읽는다', () => {
  assert.deepEqual(dbTarget('postgres://postgres:secret@localhost:5432/talju'), { user: 'postgres', database: 'talju' });
  assert.deepEqual(dbTarget('postgres://app%40x:pw@db:5432/my%20db'), { user: 'app@x', database: 'my db' });
  assert.throws(() => dbTarget('not a url'), /DATABASE_URL/);
  assert.throws(() => dbTarget('postgres://u:p@h:5432/'), /DB 이름/);
});

test('파일 이름 시각은 정렬하면 시간 순', () => {
  assert.equal(backupStamp(new Date(2026, 9, 3, 1, 5, 9)), '20261003_010509');
  assert.ok(backupStamp(new Date(2026, 8, 30)) < backupStamp(new Date(2026, 9, 1)));
});

test('최근 keep번(묶음 기준)만 남기고, 백업이 아닌 파일은 건드리지 않는다', () => {
  const files = [
    'talju_20261001_030000.dump', 'storage_20261001_030000.tar.gz',
    'talju_20261002_030000.dump', 'storage_20261002_030000.tar.gz',
    'talju_20261003_030000.dump', // 파일 백업이 없는 묶음도 하나로 센다
    'backup.log', 'talju_manual.dump', 'notes.txt',
  ];
  assert.deepEqual(expiredBackups(files, 2), ['talju_20261001_030000.dump', 'storage_20261001_030000.tar.gz']);
  assert.deepEqual(expiredBackups(files, 5), []);
  assert.throws(() => expiredBackups(files, 0), /BACKUP_KEEP/);
});
