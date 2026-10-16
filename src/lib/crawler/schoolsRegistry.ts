import type { UnivBoardConfig, NoticeCategory } from "./types.ts";
import { findUniversity, getUniversityOfficialUrl } from "../constants/koreanUniversities.ts";

export interface SchoolEntry {
  code: string;
  name: string;
  aliases: string[];
  boards: UnivBoardConfig[];
}

export const SCHOOL_REGISTRY: SchoolEntry[] = [
  {
    code: "all",
    name: "전국 공모전·취업 Pick",
    aliases: ["전국", "공모전", "대외활동", "취업", "전체"],
    boards: [
      {
        schoolCode: "all",
        schoolName: "전국 공모전·취업 Pick",
        category: "contest",
        categoryLabel: "공모전·대외활동",
        cmsType: "card_list",
        listUrl: "https://www.wevity.com/?c=find&s=1&gub=1&cidx=20",
        baseUrl: "https://www.wevity.com",
        selectors: {
          row: "ul.list > li",
          title: "div.tit a",
          date: "span.day",
          author: "span.organ",
          thumbnail: "div.thumb img",
        },
      },
      {
        schoolCode: "all",
        schoolName: "전국 공모전·취업 Pick",
        category: "contest",
        categoryLabel: "공모전",
        cmsType: "linkareer",
        listUrl: "https://linkareer.com/list/contest",
        baseUrl: "https://linkareer.com",
      },
      {
        schoolCode: "all",
        schoolName: "전국 공모전·취업 Pick",
        category: "contest",
        categoryLabel: "공모전",
        cmsType: "campuspick",
        listUrl: "https://www.campuspick.com/contest",
        baseUrl: "https://www.campuspick.com",
      },
      {
        schoolCode: "all",
        schoolName: "전국 공모전·취업 Pick",
        category: "job",
        categoryLabel: "채용·취업",
        cmsType: "card_list",
        listUrl: "https://www.wevity.com/?c=find&s=1&gub=1&cidx=21",
        baseUrl: "https://www.wevity.com",
        selectors: {
          row: "ul.list > li",
          title: "div.tit a",
          date: "span.day",
          author: "span.organ",
          thumbnail: "div.thumb img",
        },
      },
    ],
  },
  {
    code: "wevity",
    name: "위비티 (전국 공모전·대외활동)",
    aliases: ["위비티", "wevity"],
    boards: [
      {
        schoolCode: "wevity",
        schoolName: "위비티 (전국 공모전·대외활동)",
        category: "contest",
        categoryLabel: "공모전·대외활동",
        cmsType: "card_list",
        listUrl: "https://www.wevity.com/?c=find&s=1&gub=1&cidx=20",
        baseUrl: "https://www.wevity.com",
        selectors: {
          row: "ul.list > li",
          title: "div.tit a",
          date: "span.day",
          author: "span.organ",
          thumbnail: "div.thumb img",
        },
      },
    ],
  },
  {
    code: "linkareer",
    name: "링커리어 (대학생 대외활동·인턴)",
    aliases: ["링커리어", "linkareer", "인턴", "대외활동"],
    boards: [
      {
        schoolCode: "linkareer",
        schoolName: "링커리어 (대학생 대외활동·인턴)",
        category: "contest",
        categoryLabel: "공모전",
        cmsType: "linkareer",
        listUrl: "https://linkareer.com/list/contest",
        baseUrl: "https://linkareer.com",
      },
      {
        schoolCode: "linkareer",
        schoolName: "링커리어 (대학생 대외활동·인턴)",
        category: "job",
        categoryLabel: "대외활동",
        cmsType: "linkareer",
        listUrl: "https://linkareer.com/list/activity",
        baseUrl: "https://linkareer.com",
      },
    ],
  },
  {
    code: "allcon",
    name: "올콘 (전국 공모전·대외활동)",
    aliases: ["올콘", "allcon"],
    boards: [
      {
        schoolCode: "allcon",
        schoolName: "올콘 (전국 공모전·대외활동)",
        category: "contest",
        categoryLabel: "공모전·대외활동",
        cmsType: "allcon",
        listUrl: "https://www.all-con.co.kr/page/ajax.contest_list.php",
        baseUrl: "https://www.all-con.co.kr",
      },
    ],
  },
  {
    code: "campuspick",
    name: "캠퍼스픽 (대학생 공모전·동아리)",
    aliases: ["캠퍼스픽", "campuspick", "동아리"],
    boards: [
      {
        schoolCode: "campuspick",
        schoolName: "캠퍼스픽 (대학생 공모전·동아리)",
        category: "contest",
        categoryLabel: "공모전",
        cmsType: "campuspick",
        listUrl: "https://www.campuspick.com/contest",
        baseUrl: "https://www.campuspick.com",
      },
      {
        schoolCode: "campuspick",
        schoolName: "캠퍼스픽 (대학생 공모전·동아리)",
        category: "job",
        categoryLabel: "동아리·대외활동",
        cmsType: "campuspick",
        listUrl: "https://www.campuspick.com/activity",
        baseUrl: "https://www.campuspick.com",
      },
    ],
  },
  {
    code: "tongmyong",
    name: "동명대학교",
    aliases: ["동명대", "TU", "tongmyong"],
    boards: [
      {
        schoolCode: "tongmyong",
        schoolName: "동명대학교",
        category: "contest",
        categoryLabel: "공모전",
        cmsType: "egov_table",
        listUrl: "https://www.tu.ac.kr/tuhome/sub07_01_11.do",
        baseUrl: "https://www.tu.ac.kr/tuhome/sub07_01_11.do",
      },
      {
        schoolCode: "tongmyong",
        schoolName: "동명대학교",
        category: "job",
        categoryLabel: "교내채용·취업",
        cmsType: "egov_table",
        listUrl: "https://www.tu.ac.kr/tuhome/sub07_01_07.do",
        baseUrl: "https://www.tu.ac.kr/tuhome/sub07_01_07.do",
      },
      {
        schoolCode: "tongmyong",
        schoolName: "동명대학교",
        category: "general",
        categoryLabel: "일반·학사공지",
        cmsType: "egov_table",
        listUrl: "https://www.tu.ac.kr/tuhome/sub07_01_01.do",
        baseUrl: "https://www.tu.ac.kr/tuhome/sub07_01_01.do",
      },
    ],
  },
  {
    code: "seoultech",
    name: "서울과학기술대학교",
    aliases: ["서울과기대", "과기대"],
    boards: [
      {
        schoolCode: "seoultech",
        schoolName: "서울과학기술대학교",
        category: "general",
        categoryLabel: "대학공지",
        cmsType: "egov_table",
        listUrl: "https://www.seoultech.ac.kr/service/info/notice/?bnum=0&bcode=notice",
        baseUrl: "https://www.seoultech.ac.kr",
        urlTemplate: "https://www.seoultech.ac.kr/service/info/notice/?bcode=notice&bnum={ID}",
      },
      {
        schoolCode: "seoultech",
        schoolName: "서울과학기술대학교",
        category: "job",
        categoryLabel: "취업·채용",
        cmsType: "egov_table",
        listUrl: "https://www.seoultech.ac.kr/service/info/notice/?bcode=notice&cate=11",
        baseUrl: "https://www.seoultech.ac.kr",
      },
      {
        schoolCode: "seoultech",
        schoolName: "서울과학기술대학교",
        category: "general",
        categoryLabel: "학사·장학",
        cmsType: "egov_table",
        listUrl: "https://www.seoultech.ac.kr/service/info/matters/?bcode=matters",
        baseUrl: "https://www.seoultech.ac.kr",
      },
    ],
  },
  {
    code: "pusan",
    name: "부산대학교",
    aliases: ["부산대", "PNU"],
    boards: [
      {
        schoolCode: "pusan",
        schoolName: "부산대학교",
        category: "general",
        categoryLabel: "공지사항",
        cmsType: "egov_table",
        listUrl: "https://www.pusan.ac.kr/kor/CMS/Board/Board.do?mCode=MN095",
        baseUrl: "https://www.pusan.ac.kr/kor/CMS/Board/Board.do",
        selectors: {
          row: "table tbody tr",
          title: "td:nth-child(2) a",
          author: "td:nth-child(3)",
          date: "td:nth-child(4)",
          views: "td:nth-child(5)",
        },
      },
      {
        schoolCode: "pusan",
        schoolName: "부산대학교",
        category: "job",
        categoryLabel: "채용·취업",
        cmsType: "egov_table",
        listUrl: "https://www.pusan.ac.kr/kor/CMS/Board/Board.do?mCode=MN095",
        baseUrl: "https://www.pusan.ac.kr/kor/CMS/Board/Board.do",
      },
    ],
  },
  {
    code: "snu",
    name: "서울대학교",
    aliases: ["서울대", "SNU"],
    boards: [
      {
        schoolCode: "snu",
        schoolName: "서울대학교",
        category: "general",
        categoryLabel: "일반공지",
        cmsType: "egov_table",
        listUrl: "https://www.snu.ac.kr/snunow/notice/genernal",
        baseUrl: "https://www.snu.ac.kr",
      },
      {
        schoolCode: "snu",
        schoolName: "서울대학교",
        category: "job",
        categoryLabel: "채용정보",
        cmsType: "egov_table",
        listUrl: "https://www.snu.ac.kr/snunow/notice/job-openings",
        baseUrl: "https://www.snu.ac.kr",
      },
    ],
  },
  {
    code: "korea",
    name: "고려대학교",
    aliases: ["고려대", "고대", "KU"],
    boards: [
      {
        schoolCode: "korea",
        schoolName: "고려대학교",
        category: "general",
        categoryLabel: "일반공지",
        cmsType: "egov_table",
        listUrl: "https://www.korea.ac.kr/ko/566/subview.do",
        baseUrl: "https://www.korea.ac.kr/ko/566/subview.do",
        selectors: {
          row: "table tbody tr",
          title: "td.td-title a",
          author: "td.td-write",
          date: "td.td-date",
          views: "td.td-access",
        },
      },
      {
        schoolCode: "korea",
        schoolName: "고려대학교",
        category: "general",
        categoryLabel: "학사공지",
        cmsType: "egov_table",
        listUrl: "https://www.korea.ac.kr/ko/567/subview.do",
        baseUrl: "https://www.korea.ac.kr/ko/567/subview.do",
        selectors: {
          row: "table tbody tr",
          title: "td.td-title a",
          author: "td.td-write",
          date: "td.td-date",
          views: "td.td-access",
        },
      },
    ],
  },
  {
    code: "yonsei",
    name: "연세대학교",
    aliases: ["연세대", "연대", "YU"],
    boards: [
      {
        schoolCode: "yonsei",
        schoolName: "연세대학교",
        category: "contest",
        categoryLabel: "학술·연구·공모",
        cmsType: "yonsei_news",
        listUrl: "https://www.yonsei.ac.kr/sc/index.do",
        baseUrl: "https://www.yonsei.ac.kr",
      },
      {
        schoolCode: "yonsei",
        schoolName: "연세대학교",
        category: "general",
        categoryLabel: "연세소식·공지",
        cmsType: "yonsei_news",
        listUrl: "https://www.yonsei.ac.kr/sc/index.do",
        baseUrl: "https://www.yonsei.ac.kr",
      },
    ],
  },
  {
    code: "inha",
    name: "인하대학교",
    aliases: ["인하대"],
    boards: [
      {
        schoolCode: "inha",
        schoolName: "인하대학교",
        category: "general",
        categoryLabel: "인하공지",
        cmsType: "artcl_table",
        listUrl: "https://www.inha.ac.kr/kr/950/subview.do",
        baseUrl: "https://www.inha.ac.kr",
      },
      {
        schoolCode: "inha",
        schoolName: "인하대학교",
        category: "job",
        categoryLabel: "채용정보",
        cmsType: "artcl_table",
        listUrl: "https://www.inha.ac.kr/kr/951/subview.do",
        baseUrl: "https://www.inha.ac.kr",
      },
    ],
  },
  {
    code: "pknu",
    name: "부경대학교",
    aliases: ["부경대", "PKNU"],
    boards: [
      {
        schoolCode: "pknu",
        schoolName: "부경대학교",
        category: "general",
        categoryLabel: "공지사항",
        cmsType: "egov_table",
        listUrl: "https://www.pknu.ac.kr/main/163",
        baseUrl: "https://www.pknu.ac.kr",
      },
    ],
  },
  {
    code: "cnu",
    name: "충남대학교",
    aliases: ["충남대", "CNU"],
    boards: [
      {
        schoolCode: "cnu",
        schoolName: "충남대학교",
        category: "general",
        categoryLabel: "백마소식·공지",
        cmsType: "egov_table",
        listUrl: "https://plus.cnu.ac.kr/_prog/_board/?code=sub07_0701",
        baseUrl: "https://plus.cnu.ac.kr",
      },
      {
        schoolCode: "cnu",
        schoolName: "충남대학교",
        category: "job",
        categoryLabel: "채용·취업",
        cmsType: "egov_table",
        listUrl: "https://plus.cnu.ac.kr/_prog/_board/?code=sub07_0702",
        baseUrl: "https://plus.cnu.ac.kr",
      },
    ],
  },
  {
    code: "jnu",
    name: "전남대학교",
    aliases: ["전남대", "JNU"],
    boards: [
      {
        schoolCode: "jnu",
        schoolName: "전남대학교",
        category: "general",
        categoryLabel: "공지사항",
        cmsType: "egov_table",
        listUrl: "https://www.jnu.ac.kr/WebApp/web/HOM/COM/Board/board.aspx?boardID=5",
        baseUrl: "https://www.jnu.ac.kr",
      },
    ],
  },
  {
    code: "skku",
    name: "성균관대학교",
    aliases: ["성균관대", "성대", "SKKU"],
    boards: [
      {
        schoolCode: "skku",
        schoolName: "성균관대학교",
        category: "general",
        categoryLabel: "공지사항",
        cmsType: "card_list",
        listUrl: "https://www.skku.edu/skku/campus/skk_comm/notice01.do",
        baseUrl: "https://www.skku.edu/skku/campus/skk_comm/notice01.do",
        selectors: {
          row: "ul[class*='board'] li, ul[class*='list'] li, div[class*='list'] li",
          title: "dt a, .tit a, a",
          date: ".date, dd",
          author: ".writer, .organ",
        },
      },
    ],
  },
  {
    code: "ajou",
    name: "아주대학교",
    aliases: ["아주대"],
    boards: [
      {
        schoolCode: "ajou",
        schoolName: "아주대학교",
        category: "general",
        categoryLabel: "아주소식·공지",
        cmsType: "egov_table",
        listUrl: "https://www.ajou.ac.kr/kr/ajou/notice.do",
        baseUrl: "https://www.ajou.ac.kr",
      },
    ],
  },
  {
    code: "gachon",
    name: "가천대학교",
    aliases: ["가천대"],
    boards: [
      {
        schoolCode: "gachon",
        schoolName: "가천대학교",
        category: "general",
        categoryLabel: "전체공지",
        cmsType: "artcl_table",
        listUrl: "https://www.gachon.ac.kr/kor/7986/subview.do",
        baseUrl: "https://www.gachon.ac.kr",
      },
      {
        schoolCode: "gachon",
        schoolName: "가천대학교",
        category: "job",
        categoryLabel: "취업공지",
        cmsType: "artcl_table",
        listUrl: "https://www.gachon.ac.kr/kor/1148/subview.do",
        baseUrl: "https://www.gachon.ac.kr",
      },
    ],
  },
  {
    code: "kaya",
    name: "가야대학교",
    aliases: ["가야대", "kaya"],
    boards: [
      {
        schoolCode: "kaya",
        schoolName: "가야대학교",
        category: "general",
        categoryLabel: "가야뉴스·공지",
        cmsType: "egov_table",
        listUrl: "https://www.kaya.ac.kr/Home/BBSList.mbz?action=MAPP_0000000017",
        baseUrl: "https://www.kaya.ac.kr",
        urlTemplate: "https://www.kaya.ac.kr/Home/BBSView.mbz?action=MAPP_0000000017&schIdx={ID}",
      },
    ],
  },
  {
    code: "namseoul",
    name: "남서울대학교",
    aliases: ["남서울대", "남대", "NSU", "namseoul"],
    boards: [
      {
        schoolCode: "namseoul",
        schoolName: "남서울대학교",
        category: "general",
        categoryLabel: "남서울공지·소식",
        cmsType: "generic",
        listUrl: "https://www.namseoul.net/submenu.do?menuurl=RnNfVbLHUGrJz9kJgEyRDQ%3d%3d&categoryid=0",
        baseUrl: "https://www.namseoul.net",
      },
    ],
  },
  {
    code: "dongguk",
    name: "동국대학교",
    aliases: ["동국대", "동대"],
    boards: [
      {
        schoolCode: "dongguk",
        schoolName: "동국대학교",
        category: "general",
        categoryLabel: "학사·일반공지",
        cmsType: "egov_table",
        listUrl: "https://www.dongguk.edu/article/HAKSANOTICE/list",
        baseUrl: "https://www.dongguk.edu",
      },
    ],
  },
  {
    code: "hongik",
    name: "홍익대학교",
    aliases: ["홍익대", "홍대"],
    boards: [
      {
        schoolCode: "hongik",
        schoolName: "홍익대학교",
        category: "general",
        categoryLabel: "홍익공지",
        cmsType: "generic",
        listUrl: "https://www.hongik.ac.kr/kr/index.do",
        baseUrl: "https://www.hongik.ac.kr",
      },
    ],
  },
  {
    code: "cau",
    name: "중앙대학교",
    aliases: ["중앙대", "중대", "CAU"],
    boards: [
      {
        schoolCode: "cau",
        schoolName: "중앙대학교",
        category: "general",
        categoryLabel: "중앙공지",
        cmsType: "egov_table",
        listUrl: "https://www.cau.ac.kr/cms/FR_CON/index.do?MENU_ID=100",
        baseUrl: "https://www.cau.ac.kr",
      },
    ],
  },
  {
    code: "hufs",
    name: "한국외국어대학교",
    aliases: ["한국외대", "외대", "HUFS"],
    boards: [
      {
        schoolCode: "hufs",
        schoolName: "한국외국어대학교",
        category: "general",
        categoryLabel: "외대공지·학사",
        cmsType: "artcl_table",
        listUrl: "https://www.hufs.ac.kr/hufs/11284/subview.do",
        baseUrl: "https://www.hufs.ac.kr",
      },
    ],
  },
  {
    code: "ewha",
    name: "이화여자대학교",
    aliases: ["이화여대", "이대"],
    boards: [
      {
        schoolCode: "ewha",
        schoolName: "이화여자대학교",
        category: "general",
        categoryLabel: "이화공지",
        cmsType: "egov_table",
        listUrl: "https://www.ewha.ac.kr/ewha/news/notice.do",
        baseUrl: "https://www.ewha.ac.kr",
      },
    ],
  },
  {
    code: "ssu",
    name: "숭실대학교",
    aliases: ["숭실대", "SSU"],
    boards: [
      {
        schoolCode: "ssu",
        schoolName: "숭실대학교",
        category: "general",
        categoryLabel: "숭실공지·SSU",
        cmsType: "generic",
        listUrl: "https://scatch.ssu.ac.kr/%ea%b3%b5%ec%a7%80%ec%82%ac%ed%95%ad/",
        baseUrl: "https://scatch.ssu.ac.kr",
      },
    ],
  },
  {
    code: "dankook",
    name: "단국대학교",
    aliases: ["단국대", "단대", "DKU"],
    boards: [
      {
        schoolCode: "dankook",
        schoolName: "단국대학교",
        category: "general",
        categoryLabel: "단국공지",
        cmsType: "egov_table",
        listUrl: "https://www.dankook.ac.kr/web/kor/-550",
        baseUrl: "https://www.dankook.ac.kr",
      },
    ],
  },
  {
    code: "yu",
    name: "영남대학교",
    aliases: ["영남대", "YU"],
    boards: [
      {
        schoolCode: "yu",
        schoolName: "영남대학교",
        category: "general",
        categoryLabel: "영남뉴스·공지",
        cmsType: "egov_table",
        listUrl: "https://www.yu.ac.kr/main/intro/yu-news.do?mode=list&articleLimit=10&article.offset=0",
        baseUrl: "https://www.yu.ac.kr",
      },
    ],
  },
  {
    code: "kaist",
    name: "한국과학기술원",
    aliases: ["카이스트", "KAIST"],
    boards: [
      {
        schoolCode: "kaist",
        schoolName: "한국과학기술원",
        category: "general",
        categoryLabel: "KAIST공지",
        cmsType: "egov_table",
        listUrl: "https://www.kaist.ac.kr/kr/html/footer/0801.html",
        baseUrl: "https://www.kaist.ac.kr",
      },
    ],
  },
];

export function findSchoolEntry(query: string): SchoolEntry | undefined {
  if (!query) return undefined;
  const rawQ = query.trim();
  const q = rawQ.toLowerCase();
  // 접미사 "대학교", "대학", "캠퍼스"를 제거한 순수 기본명 (예: "남서울", "서울", "가야")
  const normQ = q.replace(/대학교$|대학$|캠퍼스$/g, "").trim();

  // 1순위: 학교 코드나 전체 이름이 정확히 일치 (예: '서울대학교' === '서울대학교', 'snu' === 'snu')
  const exact = SCHOOL_REGISTRY.find(
    (s) => s.code.toLowerCase() === q || s.name.toLowerCase() === q
  );
  if (exact) return exact;

  // 2순위: 별칭(alias)이 검색어와 정확히 일치 (예: '과기대' === '과기대', '연대' === '연대')
  const aliasExact = SCHOOL_REGISTRY.find((s) =>
    s.aliases.some((a) => a.toLowerCase() === q)
  );
  if (aliasExact) return aliasExact;

  // 3순위: 학교 기본명(normQ)이 동일한 경우 (예: '남서울' === '남서울', '서울' === '서울')
  // ※ "남서울" !== "서울" 이므로 서로 오인식되지 않음!
  const baseMatch = SCHOOL_REGISTRY.find((s) => {
    const sNorm = s.name.toLowerCase().replace(/대학교$|대학$|캠퍼스$/g, "").trim();
    return sNorm === normQ;
  });
  if (baseMatch) return baseMatch;

  // 4순위: 별칭 기본명 일치 (예: alias "남서울대" -> "남서울" === normQ)
  const aliasNormMatch = SCHOOL_REGISTRY.find((s) =>
    s.aliases.some((a) => a.toLowerCase().replace(/대학교$|대학$|캠퍼스$/g, "").trim() === normQ)
  );
  if (aliasNormMatch) return aliasNormMatch;

  // 5순위: 전국 127개 대학교 데이터셋(KOREAN_UNIVERSITIES)에서 검색하여 동적 SchoolEntry 생성
  const univ = findUniversity(rawQ);
  if (univ) {
    const officialUrl = getUniversityOfficialUrl(univ.name);
    const code = univ.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, "") || "univ";
    return {
      code,
      name: univ.name,
      aliases: univ.aliases || [],
      boards: [
        {
          schoolCode: code,
          schoolName: univ.name,
          category: "general",
          categoryLabel: "공지사항",
          cmsType: "generic",
          listUrl: officialUrl,
          baseUrl: officialUrl,
        },
        {
          schoolCode: code,
          schoolName: univ.name,
          category: "contest",
          categoryLabel: "공모전·행사",
          cmsType: "generic",
          listUrl: officialUrl,
          baseUrl: officialUrl,
        },
        {
          schoolCode: code,
          schoolName: univ.name,
          category: "job",
          categoryLabel: "취업·채용",
          cmsType: "generic",
          listUrl: officialUrl,
          baseUrl: officialUrl,
        },
      ],
    };
  }

  return undefined;
}

export function getBoardsForSchool(
  schoolQuery: string,
  category?: NoticeCategory
): UnivBoardConfig[] {
  const school = findSchoolEntry(schoolQuery);
  if (school) {
    if (!category || category === "all") {
      return school.boards;
    }
    const matched = school.boards.filter((b) => b.category === category);
    return matched.length > 0 ? matched : school.boards;
  }

  // 검색어가 전국 전체 피드 요청이거나 완전히 매칭되는 대학이 없는 경우
  return [
    {
      schoolCode: "all",
      schoolName: schoolQuery || "전국 대학생 공모전·취업",
      category: category === "job" ? "job" : "contest",
      categoryLabel: "전국 공모전·취업 Pick",
      cmsType: "card_list",
      listUrl: category === "job"
        ? "https://www.wevity.com/?c=find&s=1&gub=1&cidx=21"
        : "https://www.wevity.com/?c=find&s=1&gub=1&cidx=20",
      baseUrl: "https://www.wevity.com",
      selectors: {
        row: "ul.list > li",
        title: "div.tit a",
        date: "span.day",
        author: "span.organ",
        thumbnail: "div.thumb img",
      },
    },
  ];
}
