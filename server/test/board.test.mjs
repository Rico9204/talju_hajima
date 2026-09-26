// 게시판 API: 글(+투표)·좋아요·조회수·댓글/답글·투표/마감·수정 권한·신고(운영자만 열람·처리)·삭제.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, signupUsers, startApp } from './helpers.mjs';

let pg, app, api;
let author, reader, operator;
const call = (user, method, path, body) => api(user?.token ?? null, method, path, body);
let post, anonymousPost;

before(async () => {
  let db;
  ({ pg, db } = await createTestDb());
  ({ app, api } = await startApp(db));
  [author, reader, operator] = await signupUsers(api, 3, 'user');
  await pg.query('update profiles set is_operator = true where id = $1', [operator.id]);
});
after(async () => { await app?.close(); await pg?.close(); });

test('글쓰기: 글쓴이는 로그인한 사용자, 투표가 함께 만들어진다', async () => {
  const res = await call(author, 'POST', '/board/posts', {
    category: 'free', title: ' 점심 메뉴 ', content: '<p>골라 주세요</p>', attachments: [], hideImagePreview: true,
    poll: { question: '무엇을 먹을까요?', options: ['김밥', '라면'], allowMultiple: false, isAnonymous: false },
  });
  assert.equal(res.status, 201);
  post = res.body;
  assert.equal(post.title, '점심 메뉴');
  assert.equal(post.authorUserId, author.id);
  assert.equal(post.author, 'user0');
  assert.equal(post.hideImagePreview, true);
  assert.deepEqual(post.poll.options.map((o) => o.text), ['김밥', '라면']);
  assert.equal((await call(author, 'POST', '/board/posts', { category: 'gossip', title: 'x', content: 'y', attachments: [] })).status, 400);
  assert.equal((await call(author, 'POST', '/board/posts', { category: 'free', title: 'x', content: 'y', attachments: [], authorUserId: reader.id })).status, 400);
  const anon = await call(author, 'POST', '/board/posts', {
    category: 'free', title: '익명 투표', content: 'z', attachments: [],
    poll: { question: '찬성?', options: ['예', '아니오'], allowMultiple: false, isAnonymous: true },
  });
  anonymousPost = anon.body;
});

test('좋아요·조회수·목록: 내 좋아요 표시와 개수', async () => {
  assert.equal((await call(reader, 'PUT', `/board/posts/${post.id}/like`, { active: true })).status, 204);
  await call(reader, 'PUT', `/board/posts/${post.id}/like`, { active: true });
  assert.equal((await call(reader, 'POST', `/board/posts/${post.id}/views`)).status, 204);
  const list = (await call(reader, 'GET', '/board/posts')).body;
  const mine = list.find((p) => p.id === post.id);
  assert.equal(mine.likedByMe, true);
  assert.equal(mine.likes, 1);
  assert.equal(mine.views, 1);
  assert.equal(mine.reportedByMe, false);
  assert.equal((await call(author, 'GET', '/board/posts')).body.find((p) => p.id === post.id).likedByMe, false);
  await call(reader, 'PUT', `/board/posts/${post.id}/like`, { active: false });
  assert.equal((await call(reader, 'GET', '/board/posts')).body.find((p) => p.id === post.id).likes, 0);
});

// 주의(기존 동작 그대로): 프로필은 본인·같은 프로젝트 팀원·관리자만 읽을 수 있어(profiles_select_own),
// 프로젝트를 함께하지 않는 사람의 글·댓글 작성자는 "탈퇴한 사용자"로 보인다 — Supabase 버전과 같다(별도 수정 과제).
test('댓글과 답글', async () => {
  assert.equal((await call(reader, 'POST', `/board/posts/${post.id}/comments`, { content: '김밥이요' })).status, 204);
  const [first] = (await call(reader, 'GET', `/board/posts/${post.id}/comments`)).body;
  assert.equal(first.author, 'user1'); // 본인 이름은 보임
  assert.equal((await call(author, 'GET', `/board/posts/${post.id}/comments`)).body[0].author, '탈퇴한 사용자'); // 기존 동작
  assert.equal((await call(author, 'POST', `/board/posts/${post.id}/comments`, { content: '좋아요', parentCommentId: first.id })).status, 204);
  const comments = (await call(reader, 'GET', `/board/posts/${post.id}/comments`)).body;
  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0].replies.map((r) => r.content), ['좋아요']);
  assert.equal((await call(reader, 'POST', `/board/posts/${post.id}/comments`, { content: '  ' })).status, 400);
  assert.equal((await call(reader, 'DELETE', `/board/comments/${comments[0].replies[0].id}`)).status, 204); // 남의 답글: 지워지지 않음
  assert.equal((await call(reader, 'GET', `/board/posts/${post.id}/comments`)).body[0].replies.length, 1);
});

test('투표: 내 선택·투표자 표시, 익명 투표는 투표자를 숨기고, 마감 후에는 못 한다', async () => {
  const [kimbap] = post.poll.options;
  const voted = await call(reader, 'POST', `/board/polls/${post.poll.id}/votes`, { optionIds: [kimbap.id] });
  assert.equal(voted.status, 201);
  assert.deepEqual(voted.body.myOptionIds, [kimbap.id]);
  assert.equal(voted.body.totalVotes, 1);
  assert.deepEqual(voted.body.options[0].voters.map((v) => v.name), ['user1']);
  const anonVote = await call(reader, 'POST', `/board/polls/${anonymousPost.poll.id}/votes`, { optionIds: [anonymousPost.poll.options[0].id] });
  assert.deepEqual(anonVote.body.options[0].voters, []);
  assert.equal(anonVote.body.options[0].votesCount, 1);
  assert.equal((await call(reader, 'POST', `/board/polls/${post.poll.id}/close`)).status, 400); // 글쓴이만 마감
  assert.equal((await call(author, 'POST', `/board/polls/${post.poll.id}/close`)).status, 204);
  assert.equal((await call(author, 'POST', `/board/polls/${post.poll.id}/votes`, { optionIds: [kimbap.id] })).status, 400);
});

test('수정: 글쓴이만(다른 사람의 수정은 아무것도 바꾸지 않음), 미리보기 숨김 해제', async () => {
  await call(reader, 'PATCH', `/board/posts/${post.id}`, { title: '해킹' });
  assert.equal((await call(author, 'PATCH', `/board/posts/${post.id}`, { title: '점심 메뉴(마감)', hideImagePreview: false })).status, 204);
  const updated = (await call(reader, 'GET', '/board/posts')).body.find((p) => p.id === post.id);
  assert.equal(updated.title, '점심 메뉴(마감)');
  assert.equal(updated.hideImagePreview, false);
  assert.equal((await call(reader, 'GET', `/board/posts/${post.id}/content`)).body.content, '<p>골라 주세요</p>');
});

test('신고: 누구나 신고, 신고자는 자기 신고만, 전체 목록·처리는 운영자만', async () => {
  assert.equal((await call(reader, 'POST', `/board/posts/${post.id}/reports`, { reason: 'spam', detail: '광고' })).status, 204);
  assert.equal((await call(reader, 'POST', `/board/posts/${post.id}/reports`, { reason: 'bad', detail: '' })).status, 400);
  assert.equal((await call(reader, 'GET', '/board/posts')).body.find((p) => p.id === post.id).reportedByMe, true);
  assert.equal((await call(reader, 'GET', '/board/reports')).body.length, 1); // 자기 신고(내가 신고함 표시용)
  assert.deepEqual((await call(author, 'GET', '/board/reports')).body, []); // 글쓴이는 누가 신고했는지 못 봄
  const reports = (await call(operator, 'GET', '/board/reports')).body;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reason, 'spam');
  assert.equal((await call(operator, 'GET', `/board/posts/${post.id}/reports`)).body.length, 1);
  assert.equal((await call(reader, 'POST', `/board/reports/${reports[0].id}/review`, { status: 'resolved' })).status, 400);
  assert.equal((await call(operator, 'POST', `/board/reports/${reports[0].id}/review`, { status: 'resolved' })).status, 204);
  assert.equal((await call(operator, 'GET', '/board/reports')).body[0].status, 'resolved');
});

test('삭제: 글쓴이만, 지운 글의 원문은 null', async () => {
  await call(reader, 'DELETE', `/board/posts/${post.id}`);
  assert.ok((await call(reader, 'GET', '/board/posts')).body.some((p) => p.id === post.id));
  assert.equal((await call(author, 'DELETE', `/board/posts/${post.id}`)).status, 204);
  assert.ok(!(await call(reader, 'GET', '/board/posts')).body.some((p) => p.id === post.id));
  assert.equal((await call(reader, 'GET', `/board/posts/${post.id}/content`)).body.content, null);
});
