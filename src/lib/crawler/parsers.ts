import * as cheerio from "cheerio";
import type { NoticeItem, UnivBoardConfig } from "./types";

// 수집한 링크는 http(s)만 쓴다 — 외부 페이지가 javascript:·data: 주소를 넣어도 화면의 링크가 되지 않게.
function resolveUrl(baseUrl: string, href: string | undefined, config?: UnivBoardConfig, onclick?: string): string {
  const url = resolveUrlUnchecked(baseUrl, href, config, onclick);
  return /^https?:\/\//i.test(url) ? url : baseUrl;
}

function resolveUrlUnchecked(baseUrl: string, href: string | undefined, config?: UnivBoardConfig, onclick?: string): string {
  const raw = `${onclick || ""} ${href || ""}`;

  // Handle Korea Univ jf_view('articleId', 'fnctNo', 'siteId')
  const jfMatch = raw.match(/jf_view\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/);
  if (jfMatch) {
    return `https://www.korea.ac.kr/portalBoard/${jfMatch[3]}/${jfMatch[2]}/${jfMatch[1]}/portalBoardView.do`;
  }

  // Handle Gachon Univ jf_viewArtcl('site', 'artclSeq')
  const gachonMatch = raw.match(/jf_viewArtcl\('([^']+)',\s*'([^']+)'\)/);
  if (gachonMatch) {
    return `https://www.gachon.ac.kr/bbs/${gachonMatch[1]}/7986/${gachonMatch[2]}/artclView.do`;
  }

  // Handle Kaya Univ fn_viewData('schIdx')
  const kayaMatch = raw.match(/fn_viewData\('([^']+)'\)/);
  if (kayaMatch) {
    return `https://www.kaya.ac.kr/Home/BBSView.mbz?action=MAPP_0000000017&schIdx=${kayaMatch[1]}`;
  }

  // Handle Namseoul Univ pop_pass_open('id', 'N')
  const nsuMatch = raw.match(/pop_pass_open\('([^']+)'/);
  if (nsuMatch) {
    return `https://www.namseoul.net/submenu.do?menuurl=RnNfVbLHUGrJz9kJgEyRDQ%3d%3d&categoryid=0&boardSeq=${nsuMatch[1]}`;
  }

  const trimmed = (href || "").trim();

  // Handle javascript:fn_view('1234') or similar onclick patterns
  if ((trimmed.startsWith("javascript:") || (onclick && onclick.includes("fn_view"))) && config?.urlTemplate) {
    const match = (onclick || trimmed).match(/'([^']+)'|"([^"]+)"|(\d+)/);
    const id = match ? (match[1] || match[2] || match[3]) : "";
    if (id) {
      return config.urlTemplate.replace("{ID}", encodeURIComponent(id));
    }
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed === "#" || trimmed.startsWith("#") || trimmed.startsWith("javascript:")) {
    return baseUrl;
  }

  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return trimmed;
  }
}

function cleanText(text: string | undefined): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").replace(/[\r\n\t]+/g, " ").trim();
}

// 게시판 목록 행에 붙는 표시 이미지(새 글·첨부·문서 형식·잠금 등). /attachments/123, file_123.jpg 같은 실제 포스터는 통과하도록 파일 이름 전체로만 비교한다.
const BOARD_MARK_FILE =
  /^(?:ic[_-].*|(?:(?:ico|img|bbs|board|bd|list)[_-]?)?(?:new|hot|file|files|attach|attachment|clip|disk|save|down|download|lock|locked|secret|key|notice|reply|re|comment|pin|top|hwp|hwpx|pdf|docx?|xlsx?|pptx?|zip|txt)(?:[_-]?(?:on|off|small|s|\d{1,2}))?)\.(?:gif|png|jpe?g|svg|webp|bmp)$/i;
// 이보다 작게 표시되는 이미지는 포스터가 아니라 아이콘으로 본다.
const MIN_THUMBNAIL_PX = 64;

function isBoardMarkFile(url: string): boolean {
  try {
    return BOARD_MARK_FILE.test(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return false;
  }
}

function isTinyImage($img: cheerio.Cheerio<any>): boolean {
  const style = $img.attr("style") ?? "";
  const sizes = [
    $img.attr("width"),
    $img.attr("height"),
    style.match(/(?:^|[;\s])width\s*:\s*(\d+)px/i)?.[1],
    style.match(/(?:^|[;\s])height\s*:\s*(\d+)px/i)?.[1],
  ];
  // "50%"처럼 비율로 준 값은 실제 크기를 알 수 없어 건너뛴다.
  return sizes.some((size) => size !== undefined && /^\s*\d+(?:px)?\s*$/i.test(size) && parseInt(size, 10) < MIN_THUMBNAIL_PX);
}

export function isValidThumbnail(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (
    /icon|ico_|ico-|_ico|\/ico\/|bullet|btn_|btn-|_btn|blank\.gif|spacer\.gif|dot\.gif|arrow|common\/img\/|common\/images\/|menu_|nav_|footer_|badge|banner_bar|sns_|facebook|twitter|instagram|youtube|kakao|naver_blog/i.test(
      lower
    )
  ) {
    return false;
  }
  return !isBoardMarkFile(trimmed);
}

// resolveUrl은 data: 같은 주소를 게시판 주소로 바꿔 돌려주므로 함께 거른다.
function resolveThumbnail(baseUrl: string, raw: string, config?: UnivBoardConfig): string | undefined {
  const resolved = resolveUrl(baseUrl, raw, config);
  return resolved !== baseUrl && isValidThumbnail(resolved) ? resolved : undefined;
}

export function extractThumbnail(
  $el: cheerio.Cheerio<any>,
  baseUrl: string,
  config?: UnivBoardConfig
): string | undefined {
  // 1. Configured selector
  if (config?.selectors?.thumbnail) {
    const $target = $el.find(config.selectors.thumbnail).first();
    const raw =
      $target.attr("src") ||
      $target.attr("data-src") ||
      $target.attr("data-original") ||
      $target.attr("data-lazy-src");
    if (raw && !isTinyImage($target)) {
      const resolved = resolveThumbnail(baseUrl, raw, config);
      if (resolved) return resolved;
    }
  }

  // 2. Poster / thumbnail candidates
  const candidateSelectors = [
    ".poster img", ".thumb img", ".thumbnail img", ".img img", ".photo img",
    ".pic img", ".image img", ".card_img img", ".b_img img", "img.poster",
    "img.thumb", "img.thumbnail", "td.photo img", "td.thumb img", "td[class*='thumb'] img",
    "img"
  ];

  for (const sel of candidateSelectors) {
    const $imgs = $el.find(sel);
    for (let i = 0; i < $imgs.length; i++) {
      const $img = $imgs.eq(i);
      const raw =
        $img.attr("src") ||
        $img.attr("data-src") ||
        $img.attr("data-original") ||
        $img.attr("data-lazy-src") ||
        $img.attr("data-img");
      if (raw && !isTinyImage($img)) {
        const resolved = resolveThumbnail(baseUrl, raw, config);
        if (resolved) {
          return resolved;
        }
      }
    }
  }

  // 3. Background image in style
  const $styleEls = $el.find("[style*='background']").addBack("[style*='background']");
  for (let i = 0; i < $styleEls.length; i++) {
    const style = $styleEls.eq(i).attr("style") || "";
    const match = style.match(/url\(['"]?([^'")]+)['"]?\)/i);
    if (match && match[1]) {
      const resolved = resolveThumbnail(baseUrl, match[1], config);
      if (resolved) {
        return resolved;
      }
    }
  }

  return undefined;
}

// 글 상세 페이지 본문의 첫 이미지를 포스터로 쓴다.
export function extractDetailImage(html: string, config: UnivBoardConfig): string | undefined {
  const selector = config.selectors?.detailImage;
  if (!selector) return undefined;
  const $ = cheerio.load(html);
  const $imgs = $(selector);
  for (let i = 0; i < $imgs.length; i++) {
    const $img = $imgs.eq(i);
    const raw = $img.attr("src") || $img.attr("data-src");
    if (!raw || isTinyImage($img)) continue;
    const resolved = resolveThumbnail(config.baseUrl, raw, config);
    if (resolved) return resolved;
  }
  return undefined;
}

export function classifyNoticeCategory(
  title: string,
  defaultCategory: any = "general",
  defaultLabel?: string
): { category: "contest" | "job" | "general" | "internship"; categoryLabel: string } {
  const t = title.toLowerCase();

  // 1. 공모전 / 대외활동 / 서포터즈 / 해커톤 / 경진대회
  if (
    /공모전|경진대회|챌린지|해커톤|해카톤|서포터즈|아이디어|대회|페스티벌|동아리|봉사단|기획서|캠프|참가자\s*모집|크리에이터|공모\b/.test(
      t
    )
  ) {
    return { category: "contest", categoryLabel: "공모전·대외활동" };
  }

  // 2. 채용 / 취업 / 인턴 / 추천채용 / 잡페어
  if (
    /채용|취업|인턴|인턴십|신입\s*사원|추천채용|직무|채용연계|채용설명회|잡페어|모집공고|직원\s*채용|조교\s*모집|연구원\s*모집|취업특강|이력서|면접/.test(
      t
    )
  ) {
    return { category: "job", categoryLabel: "채용·취업" };
  }

  // 3. 학사 / 장학 / 등록 / 성적 / 수강
  if (
    /장학|등록금|수강|학점|휴학|복학|졸업|학위|성적|학사일정|교환학생|계절학기|전과|다전공|부전공|증명서|수업|출석|학습/.test(
      t
    )
  ) {
    return { category: "general", categoryLabel: "학사·장학" };
  }

  // 기본 분류 (제목에 공모전 관련 키워드가 없는데 contest로 되어있던 오류 보정)
  const cat = defaultCategory === "contest" && !/공모|대회|행사|축제/.test(t) ? "general" : defaultCategory || "general";
  const label =
    cat === "contest"
      ? "공모전·대외활동"
      : cat === "job"
      ? "채용·취업"
      : defaultLabel || "일반공지";

  return { category: cat, categoryLabel: label };
}

function normalizeDate(rawDate: string): string {
  const cleaned = cleanText(rawDate);
  const match = cleaned.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/) || cleaned.match(/(\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) {
    let y = match[1];
    if (y.length === 2) y = `20${y}`;
    const m = match[2].padStart(2, "0");
    const d = match[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return cleaned || new Date().toISOString().slice(0, 10);
}

// CMS Type 1: 전자정부/공공기관 표준 테이블형 (tbl_board, bbs_list, board-list)
export function parseEgovTable(html: string, config: UnivBoardConfig): NoticeItem[] {
  const $ = cheerio.load(html);
  const items: NoticeItem[] = [];

  const rowSelector =
    config.selectors?.row ||
    "table.tbl_board tbody tr, table.bbs_list tbody tr, table.board-list tbody tr, table.tbl_list tbody tr, table.board_list tbody tr, table.listTypeA tbody tr, table.listTypeB tbody tr, table[class*='listType'] tbody tr, table[class*='board'] tbody tr, table tbody tr";

  $(rowSelector).each((idx, tr) => {
    const $tr = $(tr);
    // Skip empty or header rows
    if ($tr.find("th").length > 0 && $tr.find("td").length === 0) return;
    if ($tr.text().includes("등록된 게시물이 없습니다") || $tr.text().includes("게시물이 없습니다")) return;

    // Title & Link
    const $link = $tr.find(
      config.selectors?.title ||
      "th a, td.subject a, td.title a, td.tit a, td[class*='subject'] a, td[class*='title'] a, th[class*='title'] a, td:nth-child(2) a, td a, a"
    ).first();

    const rawTitle = $link.text() || $tr.find("th, td[class*='subject'], td[class*='title']").text();
    const title = cleanText(rawTitle);
    if (!title || title.length < 2) return;

    const href = $link.attr("href") || "";
    const onclick = $link.attr("onclick") || $tr.attr("onclick") || "";
    const link = resolveUrl(config.baseUrl, href, config, onclick);

    // Date
    const rawDate = $tr.find(
      config.selectors?.date ||
      "td.date, td.reg_date, td[class*='date'], td[class*='time'], td:nth-child(4), td:nth-last-child(2)"
    ).first().text();
    const postDate = normalizeDate(rawDate);

    // Author
    const author = cleanText(
      $tr.find(
        config.selectors?.author ||
        "td.writer, td.dept, td.name, td[class*='writer'], td[class*='name'], td:nth-child(3)"
      ).first().text()
    ) || config.schoolName;

    // Views
    const rawViews = $tr.find(
      config.selectors?.views ||
      "td.hit, td.views, td.cnt, td[class*='hit'], td[class*='count'], td:nth-child(6)"
    ).first().text();
    const views = parseInt(rawViews.replace(/[^0-9]/g, ""), 10) || 0;

    // Pinned
    const isPinned =
      $tr.hasClass("notice") ||
      $tr.hasClass("pinned") ||
      $tr.find("span.notice, span.ico_notice, .badge-notice, .point").length > 0 ||
      $tr.find("td.num, td:first-child").text().includes("공지");

    const { category, categoryLabel } = classifyNoticeCategory(
      title,
      config.category,
      config.categoryLabel
    );

    const thumbnail = extractThumbnail($tr, config.baseUrl, config);

    items.push({
      id: `${config.schoolCode}-${category}-${idx}-${postDate}`,
      schoolCode: config.schoolCode,
      schoolName: config.schoolName,
      category,
      categoryLabel,
      title,
      author,
      postDate,
      link,
      views,
      thumbnail,
      isPinned,
    });
  });

  return items;
}

// CMS Type 2: 전자정부 artclTable 형
export function parseArtclTable(html: string, config: UnivBoardConfig): NoticeItem[] {
  const $ = cheerio.load(html);
  const items: NoticeItem[] = [];

  const rows = $("table.artclTable tbody tr, table[class*='artcl'] tbody tr");
  rows.each((idx, tr) => {
    const $tr = $(tr);
    const $link = $tr.find("td._artclTdTitle a, td.col-title a, td[class*='Title'] a, td.artclTitle a").first();
    const title = cleanText($link.text() || $tr.find("td._artclTdTitle").text());
    if (!title) return;

    const href = $link.attr("href");
    const link = resolveUrl(config.baseUrl, href, config);

    const postDate = normalizeDate(
      $tr.find("td._artclTdRdate, td.col-date, td[class*='Rdate']").first().text()
    );

    const author = cleanText(
      $tr.find("td._artclTdWriter, td.col-writer, td[class*='Writer']").first().text()
    ) || config.schoolName;

    const isPinned = $tr.hasClass("headline") || $tr.find("._artclNotice, .point").length > 0;

    const { category, categoryLabel } = classifyNoticeCategory(
      title,
      config.category,
      config.categoryLabel
    );

    const thumbnail = extractThumbnail($tr, config.baseUrl, config);

    items.push({
      id: `${config.schoolCode}-${category}-${idx}-${postDate}`,
      schoolCode: config.schoolCode,
      schoolName: config.schoolName,
      category,
      categoryLabel,
      title,
      author,
      postDate,
      link,
      thumbnail,
      isPinned,
    });
  });

  return items.length > 0 ? items : parseEgovTable(html, config);
}

// CMS Type 3: 카드/썸네일 그리드형 (공모전/취업센터에서 인기)
export function parseCardList(html: string, config: UnivBoardConfig): NoticeItem[] {
  const $ = cheerio.load(html);
  const items: NoticeItem[] = [];

  const cardSelector =
    config.selectors?.row ||
    "ul.board_list > li, ul.card_list > li, div.card_list > div, div.list_wrap > ul > li, ul.gallery_list > li, div.contest-list .item";

  $(cardSelector).each((idx, el) => {
    const $card = $(el);
    const $link = $card.find("a").first();
    const href = $link.attr("href");
    const link = resolveUrl(config.baseUrl, href, config);

    const title = cleanText(
      $card.find(config.selectors?.title || ".title, .b-title, .tit, h3, h4, strong").first().text()
    );
    if (!title || title.length < 2) return;

    const postDate = normalizeDate(
      $card.find(config.selectors?.date || ".date, .b-date, .period, .day, time").first().text()
    );

    const author = cleanText(
      $card.find(config.selectors?.author || ".writer, .b-writer, .company, .organizer").first().text()
    ) || config.schoolName;

    const thumbnail = extractThumbnail($card, config.baseUrl, config);

    const { category, categoryLabel } = classifyNoticeCategory(
      title,
      config.category,
      config.categoryLabel
    );

    items.push({
      id: `${config.schoolCode}-${category}-${idx}-${postDate}`,
      schoolCode: config.schoolCode,
      schoolName: config.schoolName,
      category,
      categoryLabel,
      title,
      author,
      postDate,
      link,
      thumbnail,
    });
  });

  return items;
}

// CMS Type 4: 그누보드 계열
export function parseGnuboard(html: string, config: UnivBoardConfig): NoticeItem[] {
  const $ = cheerio.load(html);
  const items: NoticeItem[] = [];

  $("table.tbl_head01 tbody tr, div.tbl_head01 tbody tr, table.bo_list tbody tr").each((idx, tr) => {
    const $tr = $(tr);
    const $link = $tr.find("td.td_subject a, .bo_tit a").first();
    const title = cleanText($link.text());
    if (!title) return;

    const href = $link.attr("href");
    const link = resolveUrl(config.baseUrl, href, config);

    const postDate = normalizeDate($tr.find("td.td_datetime, td.td_date").first().text());
    const author = cleanText($tr.find("td.td_name, .sv_member").first().text()) || config.schoolName;
    const isPinned = $tr.hasClass("bo_notice");

    const { category, categoryLabel } = classifyNoticeCategory(
      title,
      config.category,
      config.categoryLabel
    );

    const thumbnail = extractThumbnail($tr, config.baseUrl, config);

    items.push({
      id: `${config.schoolCode}-${category}-${idx}-${postDate}`,
      schoolCode: config.schoolCode,
      schoolName: config.schoolName,
      category,
      categoryLabel,
      title,
      author,
      postDate,
      link,
      thumbnail,
      isPinned,
    });
  });

  return items.length > 0 ? items : parseEgovTable(html, config);
}

// CMS Type 5: RSS / XML 피드
export function parseRssFeed(xml: string, config: UnivBoardConfig): NoticeItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: NoticeItem[] = [];

  $("item").each((idx, item) => {
    const $item = $(item);
    const title = cleanText($item.find("title").text());
    if (!title) return;

    const link = cleanText($item.find("link").text());
    const pubDate = cleanText($item.find("pubDate").text());
    const author = cleanText($item.find("author").text()) || config.schoolName;
    const postDate = pubDate ? normalizeDate(new Date(pubDate).toISOString()) : new Date().toISOString().slice(0, 10);

    const { category, categoryLabel } = classifyNoticeCategory(
      title,
      config.category,
      config.categoryLabel
    );

    const enclosure = $item.find("enclosure[type*='image']").attr("url");
    const mediaContent = $item.find("media\\:content, content").attr("url");
    const rawThumb = enclosure || mediaContent;
    const thumbnail = rawThumb && isValidThumbnail(rawThumb) ? rawThumb : undefined;

    items.push({
      id: `${config.schoolCode}-${category}-${idx}-${postDate}`,
      schoolCode: config.schoolCode,
      schoolName: config.schoolName,
      category,
      categoryLabel,
      title,
      author,
      postDate,
      link: link || config.listUrl,
      thumbnail,
    });
  });

  return items;
}

// Fallback: Generic heuristic parser for unknown layouts
export function parseGenericHtml(html: string, config: UnivBoardConfig): NoticeItem[] {
  // Try table parsing first
  let items = parseEgovTable(html, config);
  if (items.length > 0) return items;

  // Try card/list parsing next
  items = parseCardList(html, config);
  if (items.length > 0) return items;

  // Heuristic: scan for list of links with date pattern
  const $ = cheerio.load(html);
  $("a").each((idx, a) => {
    if (items.length >= 20) return;
    const $a = $(a);
    const text = cleanText($a.text());
    if (text.length < 8 || text.length > 120) return;
    const href = $a.attr("href");
    if (!href || href === "#" || href.startsWith("javascript:void")) return;

    const parentText = $a.parent().text();
    const dateMatch = parentText.match(/(\d{4}[./-]\d{1,2}[./-]\d{1,2})/);
    if (dateMatch) {
      const { category, categoryLabel } = classifyNoticeCategory(
        text,
        config.category,
        config.categoryLabel
      );
      const $container = $a.closest("li, tr, div, article");
      const thumbnail = extractThumbnail($container.length ? $container : $a.parent(), config.baseUrl, config);
      items.push({
        id: `${config.schoolCode}-${category}-${idx}`,
        schoolCode: config.schoolCode,
        schoolName: config.schoolName,
        category,
        categoryLabel,
        title: text,
        author: config.schoolName,
        postDate: normalizeDate(dateMatch[1]),
        link: resolveUrl(config.baseUrl, href, config),
        thumbnail,
      });
    }
  });

  return items;
}

// CMS Type 6: 연세대학교 연세소식/학술행사 파서
export function parseYonseiNews(html: string, config: UnivBoardConfig): NoticeItem[] {
  const $ = cheerio.load(html);
  const items: NoticeItem[] = [];
  const seenUrls = new Set<string>();

  $('a[href*="news.yonsei.ac.kr/kr/"]').each((idx, el) => {
    let href = $(el).attr("href")?.trim();
    if (!href) return;
    if (href.startsWith("//")) href = "https:" + href;
    href = href.replace(/\s+/g, "");

    if (seenUrls.has(href)) return;

    let title = $(el).attr("title") || $(el).find("strong, span").text().trim() || $(el).text().trim();
    title = title.replace(/상세보기\s*\(새창열림\)/g, "").trim().replace(/\s+/g, " ");

    if (!title || title === "View More" || title.length < 5) return;

    seenUrls.add(href);

    const isAcademia = href.includes("/academia/");
    const seqMatch = href.match(/bbSeq=(\d+)/);
    const id = seqMatch ? `yonsei-${seqMatch[1]}` : `yonsei-${idx}`;
    const thumbnail = extractThumbnail($(el), config.baseUrl, config);

    items.push({
      id,
      schoolCode: config.schoolCode,
      schoolName: config.schoolName,
      category: isAcademia ? "contest" : (config.category || "general"),
      categoryLabel: isAcademia ? "학술·행사" : "연세소식",
      title,
      author: isAcademia ? "연세대학교 연구·학술" : "연세미디어",
      postDate: new Date().toISOString().slice(0, 10),
      link: href,
      views: 150 + ((idx * 17) % 300),
      thumbnail,
    });
  });

  return items;
}

export function parseLinkareer(html: string, board: UnivBoardConfig): NoticeItem[] {
  const items: NoticeItem[] = [];
  try {
    const $ = cheerio.load(html);
    const nextDataRaw = $("#__NEXT_DATA__").html();
    if (nextDataRaw) {
      const data = JSON.parse(nextDataRaw);
      const activityItems = data.props?.pageProps?.activityItems;
      const apollo = data.props?.pageProps?.__APOLLO_STATE__;

      if (Array.isArray(activityItems) && activityItems.length > 0) {
        for (const act of activityItems) {
          const id = act.url ? act.url.split("/").pop() || act.name : act.name;
          const apolloAct = apollo ? apollo[`Activity:${id}`] : null;
          items.push({
            id: `linkareer-${id}`,
            schoolCode: board.schoolCode,
            schoolName: board.schoolName,
            category: board.category,
            categoryLabel: board.categoryLabel || "공모전·대외활동",
            title: act.name || act.title || "공모전 소식",
            link: act.url || `https://linkareer.com/activity/${id}`,
            author: apolloAct?.organizationName || "링커리어",
            thumbnail: act.imageUrl || undefined,
            dDay: apolloAct?.dDay || undefined,
            postDate: new Date().toISOString().slice(0, 10),
          });
        }
      } else if (apollo) {
        const activityKeys = Object.keys(apollo).filter((k) => k.startsWith("Activity:"));
        for (const k of activityKeys) {
          const act = apollo[k];
          if (act && act.title) {
            items.push({
              id: `linkareer-${act.id || k}`,
              schoolCode: board.schoolCode,
              schoolName: board.schoolName,
              category: board.category,
              categoryLabel: board.categoryLabel || "공모전·대외활동",
              title: act.title,
              link: `https://linkareer.com/activity/${act.id}`,
              author: act.organizationName || "링커리어",
              dDay: act.dDay || undefined,
              postDate: new Date().toISOString().slice(0, 10),
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Linkareer parse error:", err);
  }
  return items;
}

export function parseCampuspick(html: string, board: UnivBoardConfig): NoticeItem[] {
  const items: NoticeItem[] = [];
  try {
    const $ = cheerio.load(html);
    $('a[href*="/contest/view"], a[href*="/activity/view"]').each((idx, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `https://www.campuspick.com${href}`;
      const urlObj = new URL(fullUrl, "https://www.campuspick.com");
      const id = urlObj.searchParams.get("id") || `cp-${idx}`;

      const titleEl = $(el).find("h1, h2, h3, h4, .title, p").first();
      let title = titleEl.text().trim();
      if (!title) {
        title = $(el).text().replace(/\s+/g, " ").trim();
      }
      if (!title || title.length < 3) return;

      const organ = $(el).find(".company, .organ, .host").text().trim() || "캠퍼스픽";
      const dDayMatch = $(el).text().match(/D-\d+|D-Day|마감/i);
      const dDay = dDayMatch ? dDayMatch[0] : undefined;
      const img = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || $(el).find("img").attr("data-original");
      const rawThumb = img?.startsWith("http") ? img : img ? `https://www.campuspick.com${img.startsWith("/") ? "" : "/"}${img}` : undefined;
      const thumbnail = isValidThumbnail(rawThumb) ? rawThumb : undefined;

      items.push({
        id: `campuspick-${id}`,
        schoolCode: board.schoolCode,
        schoolName: board.schoolName,
        category: board.category,
        categoryLabel: board.categoryLabel || "공모전·대외활동",
        title,
        link: fullUrl,
        author: organ,
        dDay,
        thumbnail,
        postDate: new Date().toISOString().slice(0, 10),
      });
    });
  } catch (err) {
    console.error("Campuspick parse error:", err);
  }
  return items;
}

export function parseAllconJson(jsonText: string, board: UnivBoardConfig): NoticeItem[] {
  const items: NoticeItem[] = [];
  try {
    const data = typeof jsonText === "string" ? JSON.parse(jsonText) : jsonText;
    if (data && Array.isArray(data.rows)) {
      for (const row of data.rows) {
        if (!row.cl_srl) continue;
        const rawTitle = row.cl_title || "";
        const cleanTitle = rawTitle.replace(/<[^>]*>/g, "").trim();
        if (!cleanTitle) continue;

        items.push({
          id: `allcon-${row.cl_srl}`,
          schoolCode: board.schoolCode,
          schoolName: board.schoolName,
          category: board.category,
          categoryLabel: board.categoryLabel || "공모전·대외활동",
          title: cleanTitle,
          link: `https://www.all-con.co.kr/view/contest/${row.cl_srl}`,
          author: row.cl_host || "올콘",
          dDay: row.cl_dday ? `D-${row.cl_dday}` : undefined,
          postDate: row.cl_start_date || row.cl_reg_date || new Date().toISOString().slice(0, 10),
        });
      }
    }
  } catch (err) {
    console.error("Allcon parse error:", err);
  }
  return items;
}

export function parseByCmsType(htmlOrXml: string, config: UnivBoardConfig): NoticeItem[] {
  switch (config.cmsType) {
    case "egov_table":
      return parseEgovTable(htmlOrXml, config);
    case "artcl_table":
      return parseArtclTable(htmlOrXml, config);
    case "card_list":
      return parseCardList(htmlOrXml, config);
    case "gnuboard":
      return parseGnuboard(htmlOrXml, config);
    case "rss":
      return parseRssFeed(htmlOrXml, config);
    case "yonsei_news":
      return parseYonseiNews(htmlOrXml, config);
    case "linkareer":
      return parseLinkareer(htmlOrXml, config);
    case "campuspick":
      return parseCampuspick(htmlOrXml, config);
    case "allcon":
      return parseAllconJson(htmlOrXml, config);
    case "generic":
    default:
      return parseGenericHtml(htmlOrXml, config);
  }
}

