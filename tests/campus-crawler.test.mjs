import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEgovTable, parseArtclTable, parseCardList, parseRssFeed } from '../src/lib/crawler/parsers.ts';
import { findSchoolEntry } from '../src/lib/crawler/schoolsRegistry.ts';

test('findSchoolEntry matches school names and known aliases', () => {
  const snu = findSchoolEntry('서울대');
  assert.equal(snu?.name, '서울대학교');

  const seoultech = findSchoolEntry('서울과기대');
  assert.equal(seoultech?.name, '서울과학기술대학교');

  const pnu = findSchoolEntry('부산대');
  assert.equal(pnu?.name, '부산대학교');

  const ku = findSchoolEntry('고려대');
  assert.equal(ku?.name, '고려대학교');
});

test('parseEgovTable parses standard eGov notice table markup', () => {
  const sampleHtml = `
    <table class="tbl_board">
      <thead>
        <tr><th>번호</th><th>제목</th><th>작성자</th><th>작성일</th><th>조회수</th></tr>
      </thead>
      <tbody>
        <tr class="notice">
          <td class="num">공지</td>
          <td class="subject"><a href="/notice/view?id=101">2026학년도 2학기 장학금 신청 안내</a></td>
          <td class="writer">학생처</td>
          <td class="date">2026.09.20</td>
          <td class="hit">1520</td>
        </tr>
        <tr>
          <td class="num">1</td>
          <td class="subject"><a href="/notice/view?id=102">제3회 전국 대학생 AI 해커톤 대회</a></td>
          <td class="writer">SW사업단</td>
          <td class="date">2026.09.18</td>
          <td class="hit">412</td>
        </tr>
      </tbody>
    </table>
  `;

  const config = {
    schoolCode: 'test-univ',
    schoolName: '테스트대학교',
    category: 'contest',
    categoryLabel: '공모전',
    cmsType: 'egov_table',
    listUrl: 'https://univ.ac.kr/notices',
    baseUrl: 'https://univ.ac.kr',
  };

  const results = parseEgovTable(sampleHtml, config);
  assert.equal(results.length, 2);

  // Check first item (pinned notice)
  assert.equal(results[0].title, '2026학년도 2학기 장학금 신청 안내');
  assert.equal(results[0].author, '학생처');
  assert.equal(results[0].postDate, '2026-09-20');
  assert.equal(results[0].link, 'https://univ.ac.kr/notice/view?id=101');
  assert.equal(results[0].views, 1520);
  assert.equal(results[0].isPinned, true);

  // Check second item
  assert.equal(results[1].title, '제3회 전국 대학생 AI 해커톤 대회');
  assert.equal(results[1].author, 'SW사업단');
  assert.equal(results[1].postDate, '2026-09-18');
  assert.equal(results[1].link, 'https://univ.ac.kr/notice/view?id=102');
  assert.equal(results[1].views, 412);
  assert.equal(results[1].isPinned, false);
});

test('parseArtclTable parses artclTable structure', () => {
  const sampleHtml = `
    <table class="artclTable">
      <tbody>
        <tr class="headline">
          <td class="_artclTdTitle"><a href="/bbs/artclView.do?seq=88">2026 하반기 대기업 채용박람회</a></td>
          <td class="_artclTdWriter">인재개발원</td>
          <td class="_artclTdRdate">2026-09-15</td>
        </tr>
      </tbody>
    </table>
  `;

  const config = {
    schoolCode: 'test-artcl',
    schoolName: '아트클대학교',
    category: 'job',
    categoryLabel: '취업',
    cmsType: 'artcl_table',
    listUrl: 'https://artcl.ac.kr/list',
    baseUrl: 'https://artcl.ac.kr',
  };

  const results = parseArtclTable(sampleHtml, config);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, '2026 하반기 대기업 채용박람회');
  assert.equal(results[0].author, '인재개발원');
  assert.equal(results[0].postDate, '2026-09-15');
  assert.equal(results[0].link, 'https://artcl.ac.kr/bbs/artclView.do?seq=88');
  assert.equal(results[0].isPinned, true);
});

test('parseCardList parses card-based contest layout', () => {
  const sampleHtml = `
    <ul class="card_list">
      <li class="card_item">
        <a href="/contest/123">
          <img src="/thumbs/poster1.jpg" alt="포스터" />
          <h4 class="title">2026 공공데이터 활용 창업경진대회</h4>
          <span class="organizer">행정안전부</span>
          <span class="period">2026.09.25</span>
        </a>
      </li>
    </ul>
  `;

  const config = {
    schoolCode: 'all',
    schoolName: '전국 공모전',
    category: 'contest',
    categoryLabel: '공모전',
    cmsType: 'card_list',
    listUrl: 'https://contest.com/list',
    baseUrl: 'https://contest.com',
  };

  const results = parseCardList(sampleHtml, config);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, '2026 공공데이터 활용 창업경진대회');
  assert.equal(results[0].author, '행정안전부');
  assert.equal(results[0].postDate, '2026-09-25');
  assert.equal(results[0].thumbnail, 'https://contest.com/thumbs/poster1.jpg');
});

test('parseRssFeed parses standard RSS xml feeds', () => {
  const sampleXml = `
    <rss version="2.0">
      <channel>
        <title>대학 공지</title>
        <item>
          <title>학사일정 변경 공지</title>
          <link>https://univ.ac.kr/notice/300</link>
          <pubDate>Mon, 21 Sep 2026 09:00:00 GMT</pubDate>
          <author>교무처</author>
        </item>
      </channel>
    </rss>
  `;

  const config = {
    schoolCode: 'rss-univ',
    schoolName: 'RSS대학교',
    category: 'general',
    categoryLabel: '학사',
    cmsType: 'rss',
    listUrl: 'https://univ.ac.kr/rss',
    baseUrl: 'https://univ.ac.kr',
  };

  const results = parseRssFeed(sampleXml, config);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, '학사일정 변경 공지');
  assert.equal(results[0].author, '교무처');
  assert.equal(results[0].postDate, '2026-09-21');
  assert.equal(results[0].link, 'https://univ.ac.kr/notice/300');
});
