import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEgovTable, parseArtclTable, parseCardList, parseRssFeed } from '../src/lib/crawler/parsers.ts';
import { findSchoolEntry } from '../src/lib/crawler/schoolsRegistry.ts';
import { crawlNotices } from '../src/lib/crawler/crawlerService.ts';
import { optimizedPosterUrl } from '../src/lib/crawler/posterImage.ts';

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

test('수집한 링크는 http(s)만: javascript:·data: 주소는 게시판 주소로 바뀐다', () => {
  const row = (href, title) => `<tr><td class="num">1</td><td class="subject"><a href="${href}">${title}</a></td><td class="writer">학생처</td><td class="date">2026.09.20</td><td class="hit">1</td></tr>`;
  const html = `<table class="tbl_board"><tbody>
    ${row('JavaScript:alert(document.cookie)', '대문자 자바스크립트 링크')}
    ${row('data:text/html,<script>alert(1)</script>', '데이터 링크')}
    ${row('/notice/view?id=7', '정상 링크')}
  </tbody></table>`;
  const config = { schoolCode: 't', schoolName: '테스트대학교', category: 'general', categoryLabel: '공지', cmsType: 'egov_table', listUrl: 'https://univ.ac.kr/notices', baseUrl: 'https://univ.ac.kr' };
  const links = parseEgovTable(html, config).map((n) => n.link);
  assert.ok(links.length >= 1);
  for (const link of links) assert.match(link, /^https:\/\/univ\.ac\.kr/);
  assert.ok(links.includes('https://univ.ac.kr/notice/view?id=7'));
});

test('포스터/썸네일 이미지 추출: 테이블 및 카드에서 포스터 이미지 주소를 수집하고 아이콘은 제외한다', () => {
  const html = `
    <table class="tbl_board"><tbody>
      <tr>
        <td class="photo"><img src="/upload/poster_2026.png" alt="포스터" /></td>
        <td class="subject"><a href="/view/1">2026 대학생 소프트웨어 창업 공모전</a></td>
        <td class="writer"><img src="/img/icon_writer.gif" alt="아이콘" />산학협력단</td>
        <td class="date">2026-10-01</td>
      </tr>
      <tr>
        <td class="photo"><img src="/common/img/blank.gif" alt="빈이미지" /></td>
        <td class="subject"><a href="/view/2">하반기 장학금 정기 신청 공지</a></td>
        <td class="writer">장학복지팀</td>
        <td class="date">2026-10-02</td>
      </tr>
    </tbody></table>
  `;

  const config = {
    schoolCode: 'test-thumb',
    schoolName: '테스트대학교',
    category: 'contest',
    categoryLabel: '공모전',
    cmsType: 'egov_table',
    listUrl: 'https://univ.ac.kr/board',
    baseUrl: 'https://univ.ac.kr',
  };

  const results = parseEgovTable(html, config);
  assert.equal(results.length, 2);
  // 포스터 이미지가 있는 첫 번째 항목은 thumbnail 추출
  assert.equal(results[0].thumbnail, 'https://univ.ac.kr/upload/poster_2026.png');
  // blank.gif, icon 등 유효하지 않은 이미지는 제외
  assert.equal(results[1].thumbnail, undefined);
});

test('포스터 추출: 목록 행의 새 글·첨부·문서 형식 표시 이미지와 작게 표시되는 이미지는 건너뛴다', () => {
  const config = {
    schoolCode: 'test-mark',
    schoolName: '테스트대학교',
    category: 'general',
    categoryLabel: '일반',
    cmsType: 'egov_table',
    listUrl: 'https://univ.ac.kr/board',
    baseUrl: 'https://univ.ac.kr',
  };
  const thumbnailOf = (imgs) => parseEgovTable(
    `<table class="tbl_board"><tbody><tr><td class="subject"><a href="/view/1">공지 제목</a>${imgs}</td><td class="writer">담당</td><td class="date">2026-10-01</td></tr></tbody></table>`,
    config
  )[0].thumbnail;

  for (const src of ['/img/new.gif', '/images/board/file.gif', '/board/attach.png', '/skin/ic_new.png', '/img/hwp.gif', '/img/pdf.gif', '/img/lock.gif', '/images/notice.png', '/img/bbs_new_01.gif']) {
    assert.equal(thumbnailOf(`<img src="${src}">`), undefined, src);
  }
  assert.equal(thumbnailOf('<img src="/upload/a.png" width="16" height="16">'), undefined);
  assert.equal(thumbnailOf('<img src="/upload/a.png" style="width: 20px">'), undefined);

  // 실제 포스터 주소는 통과: 표시 이미지 뒤에 있어도 찾고, 파일 이름에 같은 낱말이 들어가도 막지 않는다.
  assert.equal(thumbnailOf('<img src="/img/new.gif"><img src="/upload/poster.png">'), 'https://univ.ac.kr/upload/poster.png');
  for (const src of ['/wbbs/file/newsletter/file_1175905643737747979.jpg', '/attachments/978388', '/download.do?id=7', '/upload/new_contest.png']) {
    assert.equal(thumbnailOf(`<img src="${src}">`), `https://univ.ac.kr${src}`, src);
  }
  assert.equal(thumbnailOf('<img src="/upload/b.png" width="50%">'), 'https://univ.ac.kr/upload/b.png');
  assert.equal(thumbnailOf('<img src="/upload/c.png" width="300" height="400">'), 'https://univ.ac.kr/upload/c.png');
});

test('상세 페이지 포스터: 설정된 게시판의 공모전 글만 읽고, 다른 사이트 링크는 요청하지 않는다', async () => {
  const CONTEST = 'https://www.tu.ac.kr/tuhome/sub07_01_11.do';
  const GENERAL = 'https://www.tu.ac.kr/tuhome/sub07_01_01.do';
  const row = (href, title, extra = '') => '<tr><td class="subject"><a href="' + href + '">' + title + '</a></td><td class="writer">담당' + extra + '</td><td class="date">2026-10-01</td></tr>';
  const table = (rows) => '<table class="tbl_board"><tbody>' + rows.join('') + '</tbody></table>';
  const lists = {
    [CONTEST]: table([
      row('https://www.tu.ac.kr/tuhome/a', '포스터 있는 공모전'),
      row('https://www.tu.ac.kr/tuhome/b', '본문 첫 이미지가 아이콘인 공모전'),
      row('https://www.tu.ac.kr/tuhome/c', '이미지 없는 공모전'),
      row('https://www.tu.ac.kr/tuhome/d', '오류 나는 공모전'),
      row('https://evil.example/e', '다른 사이트 공모전'),
      row('https://www.tu.ac.kr/tuhome/f', '목록에 포스터 있는 공모전', '<img src="/upload/list.png">'),
    ]),
    [GENERAL]: table([row('https://www.tu.ac.kr/tuhome/g', '학사 일정 안내')]),
  };
  const details = {
    'https://www.tu.ac.kr/tuhome/a': '<img src="/logo.png"><div class="fr-view"><img src="/_attach/poster-a.png"><img src="/_attach/second.png"></div>',
    'https://www.tu.ac.kr/tuhome/b': '<div class="fr-view"><img src="/img/ic_new.png"><img src="data:image/png;base64,AAAA"><img src="/_attach/poster-b.png"></div>',
    'https://www.tu.ac.kr/tuhome/c': '<div class="fr-view"><p>본문</p></div>',
  };
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(url);
    const body = lists[url] ?? details[url];
    return body === undefined ? new Response('', { status: 404 }) : new Response(body);
  };
  try {
    const { notices } = await crawlNotices('동명대학교', 'all');
    const thumb = (title) => notices.find((n) => n.title === title)?.thumbnail;
    assert.equal(thumb('포스터 있는 공모전'), 'https://www.tu.ac.kr/_attach/poster-a.png');
    assert.equal(thumb('본문 첫 이미지가 아이콘인 공모전'), 'https://www.tu.ac.kr/_attach/poster-b.png');
    assert.equal(thumb('이미지 없는 공모전'), undefined);
    assert.equal(thumb('오류 나는 공모전'), undefined);
    assert.equal(thumb('다른 사이트 공모전'), undefined);
    assert.equal(thumb('목록에 포스터 있는 공모전'), 'https://www.tu.ac.kr/upload/list.png');
    assert.equal(thumb('학사 일정 안내'), undefined);
    assert.ok(!requested.includes('https://evil.example/e'), '다른 사이트는 요청하지 않는다');
    assert.ok(!requested.includes('https://www.tu.ac.kr/tuhome/f'), '목록에 이미지가 있으면 상세를 읽지 않는다');
    assert.ok(!requested.includes('https://www.tu.ac.kr/tuhome/g'), '공모전이 아닌 글은 상세를 읽지 않는다');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('포스터 추출: 목록 행의 data: 이미지는 건너뛰고 뒤의 포스터를 찾는다', () => {
  const config = {
    schoolCode: 'test-data',
    schoolName: '테스트대학교',
    category: 'general',
    categoryLabel: '일반',
    cmsType: 'egov_table',
    listUrl: 'https://univ.ac.kr/board',
    baseUrl: 'https://univ.ac.kr/board',
  };
  const html = '<table class="tbl_board"><tbody><tr><td class="subject"><a href="/view/1">공지 제목</a><img src="data:image/png;base64,AAAA"><img src="/upload/poster.png"></td><td class="writer">담당</td><td class="date">2026-10-01</td></tr></tbody></table>';
  assert.equal(parseEgovTable(html, config)[0].thumbnail, 'https://univ.ac.kr/upload/poster.png');
  const onlyData = html.replace('<img src="/upload/poster.png">', '');
  assert.equal(parseEgovTable(onlyData, config)[0].thumbnail, undefined);
});

test('포스터 줄이기: 배포에서만 Vercel 이미지 경로를 쓰고 주소를 인코딩한다', () => {
  const url = 'https://www.tu.ac.kr/_attach/a b.png?x=1&y=2';
  assert.equal(optimizedPosterUrl(url, 640, false), url);
  const optimized = new URL(optimizedPosterUrl(url, 640, true), 'https://site.example');
  assert.equal(optimized.pathname, '/_vercel/image');
  assert.equal(optimized.searchParams.get('url'), url);
  assert.equal(optimized.searchParams.get('w'), '640');
  assert.equal(optimized.searchParams.get('q'), '75');
});

test('vercel.json: 화면이 쓰는 이미지 폭·품질이 허용 목록에 있다', async () => {
  const { readFileSync } = await import('node:fs');
  const { POSTER_WIDTH } = await import('../src/lib/crawler/posterImage.ts');
  const { images } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const width of Object.values(POSTER_WIDTH)) assert.ok(images.sizes.includes(width), String(width));
  assert.ok(images.qualities.includes(75));
});
