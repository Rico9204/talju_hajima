// 전국 대학교 목록 데이터셋 및 검색 헬퍼

export interface UniversityItem {
  name: string;
  region: string;
  aliases?: string[];
}

const CHOSUNG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ",
  "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

export function getChosung(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code >= 0 && code <= 11171) {
      result += CHOSUNG[Math.floor(code / 588)];
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}

export const KOREAN_UNIVERSITIES: UniversityItem[] = [
  // 전국 공모전 & 대외활동 전문 플랫폼
  { name: "위비티 (전국 공모전·대외활동)", region: "전국", aliases: ["위비티", "wevity", "공모전", "대외활동", "대회"] },
  { name: "링커리어 (대학생 대외활동·인턴)", region: "전국", aliases: ["링커리어", "linkareer", "인턴", "대외활동"] },
  { name: "올콘 (전국 공모전·대외활동)", region: "전국", aliases: ["올콘", "allcon", "공모전"] },
  { name: "캠퍼스픽 (대학생 공모전·동아리)", region: "전국", aliases: ["캠퍼스픽", "campuspick", "동아리"] },
  { name: "전국 공모전·취업 Pick", region: "전국", aliases: ["전국", "전체", "pick"] },

  // 서울 / 수도권
  { name: "가천대학교", region: "수도권", aliases: ["가천대"] },
  { name: "가톨릭대학교", region: "수도권", aliases: ["가대"] },
  { name: "강남대학교", region: "수도권", aliases: ["강남대"] },
  { name: "건국대학교", region: "서울", aliases: ["건대", "KU"] },
  { name: "경기대학교", region: "수도권", aliases: ["경기대"] },
  { name: "경희대학교", region: "서울/수도권", aliases: ["경희대", "KHU"] },
  { name: "고려대학교", region: "서울", aliases: ["고대", "KU"] },
  { name: "광운대학교", region: "서울", aliases: ["광운대"] },
  { name: "국민대학교", region: "서울", aliases: ["국민대"] },
  { name: "단국대학교", region: "수도권", aliases: ["단대", "DKU"] },
  { name: "대진대학교", region: "수도권", aliases: ["대진대"] },
  { name: "덕성여자대학교", region: "서울", aliases: ["덕성여대"] },
  { name: "동국대학교", region: "서울", aliases: ["동대"] },
  { name: "동덕여자대학교", region: "서울", aliases: ["동덕여대"] },
  { name: "명지대학교", region: "서울/수도권", aliases: ["명지대"] },
  { name: "삼육대학교", region: "서울", aliases: ["삼육대"] },
  { name: "상명대학교", region: "서울", aliases: ["상명대"] },
  { name: "서강대학교", region: "서울", aliases: ["서강대"] },
  { name: "서경대학교", region: "서울", aliases: ["서경대"] },
  { name: "서울과학기술대학교", region: "서울", aliases: ["서울과기대", "과기대", "Seoultech"] },
  { name: "서울대학교", region: "서울", aliases: ["서울대", "SNU"] },
  { name: "서울시립대학교", region: "서울", aliases: ["시립대", "UOS"] },
  { name: "서울여자대학교", region: "서울", aliases: ["서울여대"] },
  { name: "성공회대학교", region: "서울", aliases: ["성공회대"] },
  { name: "성균관대학교", region: "서울/수도권", aliases: ["성대", "SKKU"] },
  { name: "성신여자대학교", region: "서울", aliases: ["성신여대"] },
  { name: "세종대학교", region: "서울", aliases: ["세종대"] },
  { name: "수원대학교", region: "수도권", aliases: ["수원대"] },
  { name: "숙명여자대학교", region: "서울", aliases: ["숙대", "숙명여대"] },
  { name: "숭실대학교", region: "서울", aliases: ["숭실대", "SSU"] },
  { name: "신한대학교", region: "수도권", aliases: ["신한대"] },
  { name: "아주대학교", region: "수도권", aliases: ["아주대"] },
  { name: "안양대학교", region: "수도권", aliases: ["안양대"] },
  { name: "연세대학교", region: "서울", aliases: ["연대", "YU", "신촌"] },
  { name: "용인대학교", region: "수도권", aliases: ["용인대"] },
  { name: "을지대학교", region: "수도권/대전", aliases: ["을지대"] },
  { name: "이화여자대학교", region: "서울", aliases: ["이대", "이화여대"] },
  { name: "인천대학교", region: "수도권", aliases: ["인천대", "INU"] },
  { name: "인하대학교", region: "수도권", aliases: ["인하대"] },
  { name: "중앙대학교", region: "서울/수도권", aliases: ["중대", "CAU"] },
  { name: "차의과학대학교", region: "수도권", aliases: ["차의과학대", "차의대"] },
  { name: "총신대학교", region: "서울", aliases: ["총신대"] },
  { name: "한국공학대학교", region: "수도권", aliases: ["한국공학대", "한기대", "TUK"] },
  { name: "한국성서대학교", region: "서울", aliases: ["한국성서대"] },
  { name: "한국외국어대학교", region: "서울/수도권", aliases: ["외대", "한국외대", "HUFS"] },
  { name: "한국항공대학교", region: "수도권", aliases: ["항공대"] },
  { name: "한성대학교", region: "서울", aliases: ["한성대"] },
  { name: "한양대학교", region: "서울", aliases: ["한양대", "HYU"] },
  { name: "한양대학교 ERICA", region: "수도권", aliases: ["에리카", "ERICA"] },
  { name: "한세대", region: "수도권", aliases: ["한세대학교"] },
  { name: "협성대학교", region: "수도권", aliases: ["협성대"] },
  { name: "홍익대학교", region: "서울/세종", aliases: ["홍대", "홍익대"] },

  // 부산 / 울산 / 경남
  { name: "동명대학교", region: "부산", aliases: ["동명대", "TU"] },
  { name: "부산대학교", region: "부산", aliases: ["부산대", "PNU"] },
  { name: "부경대학교", region: "부산", aliases: ["부경대", "PKNU"] },
  { name: "동아대학교", region: "부산", aliases: ["동아대"] },
  { name: "동의대학교", region: "부산", aliases: ["동의대"] },
  { name: "신라대학교", region: "부산", aliases: ["신라대"] },
  { name: "경성대학교", region: "부산", aliases: ["경성대"] },
  { name: "한국해양대학교", region: "부산", aliases: ["해양대", "한국해양대"] },
  { name: "고신대학교", region: "부산", aliases: ["고신대"] },
  { name: "부산외국어대학교", region: "부산", aliases: ["부산외대"] },
  { name: "부산가톨릭대학교", region: "부산", aliases: ["부가대"] },
  { name: "울산대학교", region: "울산", aliases: ["울산대"] },
  { name: "울산과학기술원", region: "울산", aliases: ["유니스트", "UNIST"] },
  { name: "경상국립대학교", region: "경남", aliases: ["경상대", "경상국립대", "GNU"] },
  { name: "인제대학교", region: "경남", aliases: ["인제대"] },
  { name: "국립창원대학교", region: "경남", aliases: ["창원대"] },
  { name: "경남대학교", region: "경남", aliases: ["경남대"] },
  { name: "영산대학교", region: "경남/부산", aliases: ["영산대"] },
  { name: "가야대학교", region: "경남", aliases: ["가야대"] },

  // 대구 / 경북
  { name: "경북대학교", region: "대구/경북", aliases: ["경북대", "KNU"] },
  { name: "계명대학교", region: "대구", aliases: ["계명대"] },
  { name: "대구대학교", region: "경북", aliases: ["대구대"] },
  { name: "대구가톨릭대학교", region: "경북", aliases: ["대가대"] },
  { name: "영남대학교", region: "경북", aliases: ["영남대", "YU"] },
  { name: "금오공과대학교", region: "경북", aliases: ["금오공대", "KIT"] },
  { name: "국립안동대학교", region: "경북", aliases: ["안동대"] },
  { name: "포항공과대학교", region: "경북", aliases: ["포스텍", "포항공대", "POSTECH"] },
  { name: "대구경북과학기술원", region: "대구", aliases: ["디지스트", "DGIST"] },
  { name: "한동대학교", region: "경북", aliases: ["한동대"] },
  { name: "경일대학교", region: "경북", aliases: ["경일대"] },
  { name: "대구한의대학교", region: "경북", aliases: ["대구한의대"] },

  // 대전 / 충청 / 세종
  { name: "충남대학교", region: "대전", aliases: ["충남대", "CNU"] },
  { name: "충북대학교", region: "충북", aliases: ["충북대", "CBNU"] },
  { name: "한국과학기술원", region: "대전", aliases: ["카이스트", "KAIST"] },
  { name: "한남대학교", region: "대전", aliases: ["한남대"] },
  { name: "대전대학교", region: "대전", aliases: ["대전대"] },
  { name: "목원대학교", region: "대전", aliases: ["목원대"] },
  { name: "배재대학교", region: "대전", aliases: ["배재대"] },
  { name: "우송대학교", region: "대전", aliases: ["우송대"] },
  { name: "건양대학교", region: "충남/대전", aliases: ["건양대"] },
  { name: "한국교원대학교", region: "충북", aliases: ["교원대"] },
  { name: "한국교통대학교", region: "충북", aliases: ["교통대"] },
  { name: "한국기술교육대학교", region: "충남", aliases: ["한기대", "코리아텍"] },
  { name: "청주대학교", region: "충북", aliases: ["청주대"] },
  { name: "서원대학교", region: "충북", aliases: ["서원대"] },
  { name: "세명대학교", region: "충북", aliases: ["세명대"] },
  { name: "순천향대학교", region: "충남", aliases: ["순천향대"] },
  { name: "호서대학교", region: "충남", aliases: ["호서대"] },
  { name: "선문대학교", region: "충남", aliases: ["선문대"] },
  { name: "백석대학교", region: "충남", aliases: ["백석대"] },
  { name: "남서울대학교", region: "충남", aliases: ["남서울대"] },
  { name: "고려대학교 세종캠퍼스", region: "세종", aliases: ["고대세종"] },
  { name: "홍익대학교 세종캠퍼스", region: "세종", aliases: ["홍대세종"] },

  // 광주 / 전라
  { name: "전남대학교", region: "광주/전남", aliases: ["전남대", "CNU"] },
  { name: "전북대학교", region: "전북", aliases: ["전북대", "JBNU"] },
  { name: "광주과학기술원", region: "광주", aliases: ["지스트", "GIST"] },
  { name: "조선대학교", region: "광주", aliases: ["조선대", "조대"] },
  { name: "호남대학교", region: "광주", aliases: ["호남대"] },
  { name: "광주대학교", region: "광주", aliases: ["광주대"] },
  { name: "동신대학교", region: "전남", aliases: ["동신대"] },
  { name: "국립목포대학교", region: "전남", aliases: ["목포대"] },
  { name: "국립순천대학교", region: "전남", aliases: ["순천대"] },
  { name: "국립군산대학교", region: "전북", aliases: ["군산대"] },
  { name: "원광대학교", region: "전북", aliases: ["원광대"] },
  { name: "우석대학교", region: "전북", aliases: ["우석대"] },
  { name: "전주대학교", region: "전북", aliases: ["전주대"] },
  { name: "한국에너지공과대학교", region: "전남", aliases: ["켄텍", "KENTECH"] },

  // 강원 / 제주
  { name: "강원대학교", region: "강원", aliases: ["강원대", "KNU"] },
  { name: "국립강릉원주대학교", region: "강원", aliases: ["강릉원주대"] },
  { name: "한림대학교", region: "강원", aliases: ["한림대"] },
  { name: "상지대학교", region: "강원", aliases: ["상지대"] },
  { name: "연세대학교 미래캠퍼스", region: "강원", aliases: ["연대원주", "연대미래"] },
  { name: "가톨릭관동대학교", region: "강원", aliases: ["관동대"] },
  { name: "제주대학교", region: "제주", aliases: ["제주대"] },
  { name: "제주국제대학교", region: "제주", aliases: ["제주국제대"] },
];

export function isContestPlatform(item: UniversityItem | string): boolean {
  const name = typeof item === "string" ? item : item.name;
  return (
    name.includes("위비티") ||
    name.includes("링커리어") ||
    name.includes("올콘") ||
    name.includes("캠퍼스픽") ||
    name.includes("전국 공모전") ||
    (typeof item !== "string" && item.region === "전국")
  );
}

/**
 * 대학교 및 공모전 플랫폼 검색 (이름, 별칭, 영문, 초성 검색 지원)
 * - 검색어 미입력 시: 공모전 플랫폼 사이트 목록을 우선 표시 (대학교는 검색 시 노출)
 * - 검색어 입력 시: 일치하는 항목 중 공모전 사이트가 최우선 정렬된 후 대학교 노출
 */
export function searchUniversities(query: string, limit?: number): UniversityItem[] {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) {
    // 검색창 열었을 때: 공모전 사이트들이 먼저 뜨도록 반환
    const platforms = KOREAN_UNIVERSITIES.filter((item) => isContestPlatform(item));
    return limit ? platforms.slice(0, limit) : platforms;
  }

  const queryChosung = getChosung(cleanQ);

  const matched = KOREAN_UNIVERSITIES.filter((item) => {
    const nameLower = item.name.toLowerCase();
    const itemChosung = getChosung(item.name);

    // 1. 이름 완전/부분 일치
    if (nameLower.includes(cleanQ)) return true;

    // 2. 별칭 일치
    if (item.aliases?.some((a) => a.toLowerCase().includes(cleanQ))) return true;

    // 3. 초성 일치 (예: 'ㅇㅅ' -> '연세대학교')
    if (itemChosung.includes(queryChosung)) return true;

    return false;
  });

  // 정렬 우선순위:
  // 1. 공모전 사이트 우선 (isContestPlatform)
  // 2. 검색어로 시작하는 항목 (startsWith)
  // 3. 한글 가나다순
  matched.sort((a, b) => {
    const aIsPlatform = isContestPlatform(a);
    const bIsPlatform = isContestPlatform(b);
    if (aIsPlatform && !bIsPlatform) return -1;
    if (!aIsPlatform && bIsPlatform) return 1;

    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aStarts = aName.startsWith(cleanQ);
    const bStarts = bName.startsWith(cleanQ);

    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return aName.localeCompare(bName, "ko");
  });

  return limit ? matched.slice(0, limit) : matched;
}

export function findUniversity(query: string): UniversityItem | undefined {
  if (!query) return undefined;
  const q = query.trim().toLowerCase();
  const normQ = q.replace(/대학교$|대학$|캠퍼스$/g, "").trim();

  // 1. exact match
  const exact = KOREAN_UNIVERSITIES.find(
    (u) => u.name.toLowerCase() === q
  );
  if (exact) return exact;

  // 2. alias match
  const aliasMatch = KOREAN_UNIVERSITIES.find((u) =>
    u.aliases?.some((a) => a.toLowerCase() === q)
  );
  if (aliasMatch) return aliasMatch;

  // 3. base norm match
  const baseMatch = KOREAN_UNIVERSITIES.find((u) => {
    const uNorm = u.name.toLowerCase().replace(/대학교$|대학$|캠퍼스$/g, "").trim();
    return uNorm === normQ;
  });
  if (baseMatch) return baseMatch;

  return undefined;
}

const OFFICIAL_URL_MAP: Record<string, string> = {
  가천대학교: "https://www.gachon.ac.kr",
  가톨릭대학교: "https://www.catholic.ac.kr",
  강남대학교: "https://web.kangnam.ac.kr",
  건국대학교: "https://www.konkuk.ac.kr",
  경기대학교: "https://www.kyonggi.ac.kr",
  경희대학교: "https://www.khu.ac.kr",
  고려대학교: "https://www.korea.ac.kr",
  광운대학교: "https://www.kw.ac.kr",
  국민대학교: "https://www.kookmin.ac.kr",
  단국대학교: "https://www.dankook.ac.kr",
  대진대학교: "https://www.daejin.ac.kr",
  덕성여자대학교: "https://www.duksung.ac.kr",
  동국대학교: "https://www.dongguk.edu",
  동덕여자대학교: "https://www.dongduk.ac.kr",
  명지대학교: "https://www.mju.ac.kr",
  삼육대학교: "https://www.syu.ac.kr",
  상명대학교: "https://www.smu.ac.kr",
  서강대학교: "https://www.sogang.ac.kr",
  서경대학교: "https://www.skuniv.ac.kr",
  서울과학기술대학교: "https://www.seoultech.ac.kr",
  서울대학교: "https://www.snu.ac.kr",
  서울시립대학교: "https://www.uos.ac.kr",
  서울여자대학교: "https://www.swu.ac.kr",
  성공회대학교: "https://www.skhu.ac.kr",
  성균관대학교: "https://www.skku.edu",
  성신여자대학교: "https://www.sungshin.ac.kr",
  세종대학교: "https://www.sejong.ac.kr",
  수원대학교: "https://www.suwon.ac.kr",
  숙명여자대학교: "https://www.sookmyung.ac.kr",
  숭실대학교: "https://www.ssu.ac.kr",
  신한대학교: "https://www.shinhan.ac.kr",
  아주대학교: "https://www.ajou.ac.kr",
  안양대학교: "https://www.anyang.ac.kr",
  연세대학교: "https://www.yonsei.ac.kr",
  용인대학교: "https://www.yongin.ac.kr",
  을지대학교: "https://www.eulji.ac.kr",
  이화여자대학교: "https://www.ewha.ac.kr",
  인천대학교: "https://www.inu.ac.kr",
  인하대학교: "https://www.inha.ac.kr",
  중앙대학교: "https://www.cau.ac.kr",
  한국공학대학교: "https://www.tukorea.ac.kr",
  한국교원대학교: "https://www.knue.ac.kr",
  한국성서대학교: "https://www.bible.ac.kr",
  한국외국어대학교: "https://www.hufs.ac.kr",
  한국항공대학교: "https://www.kau.ac.kr",
  한성대학교: "https://www.hansung.ac.kr",
  한양대학교: "https://www.hanyang.ac.kr",
  홍익대학교: "https://www.hongik.ac.kr",
  동명대학교: "https://www.tu.ac.kr",
  부산대학교: "https://www.pusan.ac.kr",
  부경대학교: "https://www.pknu.ac.kr",
  동아대학교: "https://www.donga.ac.kr",
  동의대학교: "https://www.deu.ac.kr",
  신라대학교: "https://www.silla.ac.kr",
  경성대학교: "https://www.ks.ac.kr",
  한국해양대학교: "https://www.kmou.ac.kr",
  울산대학교: "https://www.ulsan.ac.kr",
  울산과학기술원: "https://www.unist.ac.kr",
  경상국립대학교: "https://www.gnu.ac.kr",
  인제대학교: "https://www.inje.ac.kr",
  국립창원대학교: "https://www.changwon.ac.kr",
  경남대학교: "https://www.kyungnam.ac.kr",
  가야대학교: "https://www.kaya.ac.kr",
  경북대학교: "https://www.knu.ac.kr",
  계명대학교: "https://www.kmu.ac.kr",
  대구대학교: "https://www.daegu.ac.kr",
  대구가톨릭대학교: "https://www.cu.ac.kr",
  영남대학교: "https://www.yu.ac.kr",
  금오공과대학교: "https://www.kumoh.ac.kr",
  국립안동대학교: "https://www.andong.ac.kr",
  포항공과대학교: "https://www.postech.ac.kr",
  대구경북과학기술원: "https://www.dgist.ac.kr",
  한동대학교: "https://www.handong.edu",
  충남대학교: "https://plus.cnu.ac.kr",
  충북대학교: "https://www.chungbuk.ac.kr",
  한국과학기술원: "https://www.kaist.ac.kr",
  한남대학교: "https://www.hannam.ac.kr",
  대전대학교: "https://www.dju.ac.kr",
  목원대학교: "https://www.mokwon.ac.kr",
  배재대학교: "https://www.pcu.ac.kr",
  우송대학교: "https://www.wsu.ac.kr",
  한국교통대학교: "https://www.ut.ac.kr",
  한국기술교육대학교: "https://www.koreatech.ac.kr",
  청주대학교: "https://www.cju.ac.kr",
  순천향대학교: "https://www.sch.ac.kr",
  호서대학교: "https://www.hoseo.ac.kr",
  선문대학교: "https://www.sunmoon.ac.kr",
  백석대학교: "https://www.bu.ac.kr",
  남서울대학교: "https://www.namseoul.net",
  전남대학교: "https://www.jnu.ac.kr",
  전북대학교: "https://www.jbnu.ac.kr",
  광주과학기술원: "https://www.gist.ac.kr",
  조선대학교: "https://www.chosun.ac.kr",
  호남대학교: "https://www.honam.ac.kr",
  광주대학교: "https://www.gwangju.ac.kr",
  동신대학교: "https://www.dsu.ac.kr",
  국립목포대학교: "https://www.mokpo.ac.kr",
  국립순천대학교: "https://www.scnu.ac.kr",
  국립군산대학교: "https://www.kunsan.ac.kr",
  원광대학교: "https://www.wonkwang.ac.kr",
  우석대학교: "https://www.woosuk.ac.kr",
  전주대학교: "https://www.jj.ac.kr",
  한국에너지공과대학교: "https://www.kentech.ac.kr",
  강원대학교: "https://www.kangwon.ac.kr",
  국립강릉원주대학교: "https://www.gwnu.ac.kr",
  한림대학교: "https://www.hallym.ac.kr",
  상지대학교: "https://www.sangji.ac.kr",
  제주대학교: "https://www.jejunu.ac.kr",
  차의과학대학교: "https://www.cha.ac.kr",
  총신대학교: "https://www.chongshin.ac.kr",
  "한양대학교 ERICA": "https://erica.hanyang.ac.kr",
  한세대: "https://www.hansei.ac.kr",
  한세대학교: "https://www.hansei.ac.kr",
  협성대학교: "https://www.uhs.ac.kr",
  고신대학교: "https://www.koshin.ac.kr",
  부산외국어대학교: "https://www.bufs.ac.kr",
  부산가톨릭대학교: "https://www.cup.ac.kr",
  영산대학교: "https://www.ysu.ac.kr",
  경일대학교: "https://www.kiu.ac.kr",
  대구한의대학교: "https://www.dhu.ac.kr",
  건양대학교: "https://www.konyang.ac.kr",
  서원대학교: "https://www.seowon.ac.kr",
  세명대학교: "https://www.semyung.ac.kr",
  "고려대학교 세종캠퍼스": "https://sejong.korea.ac.kr",
  "홍익대학교 세종캠퍼스": "https://sejong.hongik.ac.kr",
  "연세대학교 미래캠퍼스": "https://wonju.yonsei.ac.kr",
  가톨릭관동대학교: "https://www.cku.ac.kr",
  제주국제대학교: "https://www.jeju.ac.kr",
  "위비티 (전국 공모전·대외활동)": "https://www.wevity.com",
  "위비티": "https://www.wevity.com",
  "링커리어 (대학생 대외활동·인턴)": "https://linkareer.com",
  "링커리어": "https://linkareer.com",
  "올콘 (전국 공모전·대외활동)": "https://www.all-con.co.kr",
  "올콘": "https://www.all-con.co.kr",
  "캠퍼스픽 (대학생 공모전·동아리)": "https://www.campuspick.com",
  "캠퍼스픽": "https://www.campuspick.com",
  "전국 공모전·취업 Pick": "https://www.wevity.com",
};

export function getUniversityOfficialUrl(schoolName: string): string {
  if (!schoolName) return "https://www.academyinfo.go.kr";
  const raw = schoolName.trim();
  if (OFFICIAL_URL_MAP[raw]) return OFFICIAL_URL_MAP[raw];

  // Try normalized or alias matching
  const univ = findUniversity(raw);
  if (univ && OFFICIAL_URL_MAP[univ.name]) return OFFICIAL_URL_MAP[univ.name];

  const norm = raw.replace(/대학교$|대학$|캠퍼스$/g, "").trim();
  for (const [key, url] of Object.entries(OFFICIAL_URL_MAP)) {
    const keyNorm = key.replace(/대학교$|대학$|캠퍼스$/g, "").trim();
    if (keyNorm === norm) return url;
  }

  return "https://www.academyinfo.go.kr";
}
