import test from 'node:test';
import assert from 'node:assert/strict';
import { sortNotices, NOTICE_SORT_OPTIONS } from '../src/lib/crawler/noticeSort.ts';

const mockNotices = [
  {
    id: '1',
    schoolCode: 'test',
    schoolName: '테스트대',
    category: 'general',
    title: '다. 학사일정 안내',
    author: '교무처',
    postDate: '2026-03-01',
    link: 'https://example.com/1',
    isPinned: false,
  },
  {
    id: '2',
    schoolCode: 'test',
    schoolName: '테스트대',
    category: 'contest',
    title: '가. 해커톤 대회',
    author: '소프트',
    postDate: '2026-03-10',
    link: 'https://example.com/2',
    isPinned: false,
  },
  {
    id: '3',
    schoolCode: 'test',
    schoolName: '테스트대',
    category: 'general',
    title: '라. 상단 고정 공지',
    author: '학사과',
    postDate: '2026-02-01',
    link: 'https://example.com/3',
    isPinned: true,
  },
  {
    id: '4',
    schoolCode: 'test',
    schoolName: '테스트대',
    category: 'job',
    title: '나. 채용 연계형 인턴 공고',
    author: '취업지원팀',
    postDate: '2026-03-05',
    link: 'https://example.com/4',
    isPinned: false,
  },
];

test('NOTICE_SORT_OPTIONS: 최신순, 가나다순, 카테고리순 3개 옵션만 제공', () => {
  assert.equal(NOTICE_SORT_OPTIONS.length, 3);
  assert.deepEqual(NOTICE_SORT_OPTIONS.map((o) => o.label), ['최신순', '가나다순', '카테고리순']);
});

test('sortNotices (latest): 고정글 최우선 및 최신 날짜순 정렬', () => {
  const sorted = sortNotices(mockNotices, 'latest');
  assert.equal(sorted[0].id, '3', '고정글(isPinned)이 최상단');
  assert.equal(sorted[1].id, '2', '2026-03-10 공지가 두 번째');
  assert.equal(sorted[2].id, '4', '2026-03-05 공지가 세 번째');
  assert.equal(sorted[3].id, '1', '2026-03-01 공지가 마지막');
});

test('sortNotices (title): 제목 가나다순 정렬', () => {
  const sorted = sortNotices(mockNotices, 'title');
  assert.equal(sorted[0].title.startsWith('가.'), true);
  assert.equal(sorted[1].title.startsWith('나.'), true);
  assert.equal(sorted[2].title.startsWith('다.'), true);
  assert.equal(sorted[3].title.startsWith('라.'), true);
});

test('sortNotices (category): 카테고리순 (공모전 -> 채용 -> 학사)', () => {
  const sorted = sortNotices(mockNotices, 'category');
  assert.equal(sorted[0].category, 'contest', '공모전 카테고리 최우선');
  assert.equal(sorted[1].category, 'job', '채용 카테고리 두 번째');
  assert.equal(sorted[2].category, 'general', '학사 카테고리 세 번째');
  assert.equal(sorted[3].category, 'general', '학사 카테고리 네 번째');
});
