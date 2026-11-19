// 다른 팀원이 고친 내용 표시: 원작자·수정자 판별(계정 ID 우선, 예전 버전은 이름), 처음 글에 없는 줄 찾기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileEditStatus, linesChangedFromOriginal, originalVersion } from '../src/lib/workspaceFiles.ts';

const v = (id, uploadedBy, uploadedByUserId = null, current = false) => ({ id, uploadedBy, uploadedByUserId, current });
const file = (versions, uploader = '아무개') => ({ uploader, versions });

test('원작자는 맨 처음 버전을 올린 사람(files.uploader는 마지막 저장한 사람이라 쓰지 않음)', () => {
  const f = file([v(3, '이영희', 'u2', true), v(1, '김철수', 'u1')], '이영희');
  assert.equal(originalVersion(f).id, 1);
  assert.deepEqual(fileEditStatus(f), { originalAuthor: '김철수', editor: '이영희', byOther: true });
});

test('같은 사람이 이어서 저장한 버전, 처음 버전 자체는 다른 사람 수정이 아니다', () => {
  const f = file([v(1, '김철수', 'u1'), v(2, '김철수', 'u1', true)]);
  assert.equal(fileEditStatus(f).byOther, false);
  assert.equal(fileEditStatus(f, f.versions[0]).byOther, false);
});

test('계정 ID가 있으면 이름이 같아도 다른 사람, 이름을 바꿔도 같은 사람', () => {
  assert.equal(fileEditStatus(file([v(1, '김민수', 'u1'), v(2, '김민수', 'u2', true)])).byOther, true);
  assert.equal(fileEditStatus(file([v(1, '민수', 'u1'), v(2, '김민수', 'u1', true)])).byOther, false);
});

test('예전 버전처럼 계정 ID가 없으면 이름으로 비교한다', () => {
  assert.equal(fileEditStatus(file([v(1, '김철수'), v(2, '이영희', 'u2', true)])).byOther, true);
  assert.equal(fileEditStatus(file([v(1, '김철수'), v(2, '김철수 ', 'u1', true)])).byOther, false);
});

test('현재 버전 표시가 없으면 가장 최근 버전 기준, 버전이 없으면 null', () => {
  assert.equal(fileEditStatus(file([v(1, '김철수', 'u1'), v(5, '이영희', 'u2')])).editor, '이영희');
  assert.equal(fileEditStatus(file([])), null);
});

test('처음 글에 없는 줄만 고른다(공백 차이·빈 줄·줄 순서 바뀜은 무시)', () => {
  const original = '제목\n첫 문단입니다.\n둘째 문단';
  const text = '제목\n\n둘째   문단\n첫 문단입니다.\n새로 넣은 문단\n둘째 문단 고침';
  assert.deepEqual([...linesChangedFromOriginal(original, text)], [4, 5]);
  assert.deepEqual([...linesChangedFromOriginal('', 'a\r\nb')], [0, 1]);
});
