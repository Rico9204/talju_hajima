// 코드 파일 문법 색칠: 확장자로 언어를 고르고 주석·문자열·숫자·키워드 등을 토큰으로 나눈다.
// 완전한 파서가 아니라 화면 색칠용이라, 애매한 문법은 그냥 일반 글자로 둔다(토큰을 이어 붙이면 항상 원문과 같다).

export type CodeTokenKind = "comment" | "string" | "number" | "keyword" | "type" | "meta" | "tag" | "attr";
export type CodeToken = { text: string; kind: CodeTokenKind | null };

type LangSpec = {
  line?: string[]; // 한 줄 주석 시작
  block?: [string, string]; // 여러 줄 주석
  quotes: string[]; // 문자열 따옴표(세 겹 따옴표는 한 겹보다 앞에)
  keywords: string;
  ignoreCase?: boolean; // SQL처럼 대소문자 구분 없는 키워드
  capsTypes?: boolean; // 대문자로 시작하는 이름(String, ArrayList)을 타입 색으로
  preprocessor?: boolean; // 줄 첫머리의 #include 같은 전처리 지시문
  annotations?: boolean; // @Override, @decorator
  markup?: boolean; // HTML/XML 태그
};

const C_WORDS = "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL size_t";
const JS_WORDS = "break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null return super switch this throw true try typeof undefined var void while with yield async await of static get set";

const LANGS: Record<string, LangSpec> = {
  c: { line: ["//"], block: ["/*", "*/"], quotes: ['"', "'"], keywords: C_WORDS, preprocessor: true },
  cpp: { line: ["//"], block: ["/*", "*/"], quotes: ['"', "'"], preprocessor: true, capsTypes: true,
    keywords: C_WORDS + " class namespace template typename public private protected virtual override new delete this using try catch throw nullptr operator friend explicit constexpr noexcept mutable final decltype static_cast const_cast dynamic_cast reinterpret_cast std string vector" },
  java: { line: ["//"], block: ["/*", "*/"], quotes: ['"', "'"], capsTypes: true, annotations: true,
    keywords: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield sealed permits" },
  kotlin: { line: ["//"], block: ["/*", "*/"], quotes: ['"""', '"', "'"], capsTypes: true, annotations: true,
    keywords: "as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while import private public protected internal override open data companion sealed enum lateinit suspend" },
  csharp: { line: ["//"], block: ["/*", "*/"], quotes: ['"', "'"], capsTypes: true, preprocessor: true,
    keywords: "abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach get goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref return sbyte sealed set short sizeof static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while" },
  javascript: { line: ["//"], block: ["/*", "*/"], quotes: ['"', "'", "`"], keywords: JS_WORDS },
  typescript: { line: ["//"], block: ["/*", "*/"], quotes: ['"', "'", "`"], capsTypes: true, annotations: true,
    keywords: JS_WORDS + " interface type enum implements namespace declare abstract private protected public readonly keyof as is satisfies any unknown never number string boolean" },
  python: { line: ["#"], quotes: ['"""', "'''", '"', "'"], annotations: true,
    keywords: "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self print len range int str float list dict set tuple" },
  go: { line: ["//"], block: ["/*", "*/"], quotes: ['"', "'", "`"],
    keywords: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil int int64 string bool byte error float64 rune" },
  rust: { line: ["//"], block: ["/*", "*/"], quotes: ['"'], capsTypes: true,
    keywords: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while i32 i64 u8 u32 u64 usize f32 f64 bool str String" },
  swift: { line: ["//"], block: ["/*", "*/"], quotes: ['"""', '"'], capsTypes: true, annotations: true,
    keywords: "class struct enum protocol extension func var let if else guard return for in while repeat switch case default break continue import true false nil self Self init deinit public private fileprivate internal static try catch throw throws async await" },
  php: { line: ["//", "#"], block: ["/*", "*/"], quotes: ['"', "'"],
    keywords: "abstract and array as break case catch class const continue default do echo else elseif extends false final finally fn for foreach function global if implements include interface new null or private protected public require require_once return static switch this throw true try use var while" },
  ruby: { line: ["#"], quotes: ['"', "'"], capsTypes: true,
    keywords: "def end class module if elsif else unless while until do return true false nil self require yield begin rescue ensure then case when and or not in attr_accessor puts" },
  shell: { line: ["#"], quotes: ['"', "'"],
    keywords: "if then else elif fi for while until do done case esac function in return export local echo exit set unset source" },
  sql: { line: ["--"], block: ["/*", "*/"], quotes: ["'", '"'], ignoreCase: true,
    keywords: "select from where insert into values update set delete create table alter drop index view and or not null is in like between join left right inner outer full on group by order having limit offset as distinct union all primary key foreign references default unique check begin end function returns return language declare if then else case when exists with grant revoke replace trigger asc desc count sum avg min max int integer varchar text boolean date timestamp" },
  css: { block: ["/*", "*/"], quotes: ['"', "'"], annotations: true, keywords: "important" },
  json: { quotes: ['"'], keywords: "true false null" },
  yaml: { line: ["#"], quotes: ['"', "'"], keywords: "true false null yes no on off" },
  markup: { quotes: [], keywords: "", markup: true },
};

const LANGUAGE_BY_EXT: Record<string, string> = {
  c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
  java: "java", kt: "kotlin", kts: "kotlin", cs: "csharp",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", go: "go", rs: "rust", swift: "swift", php: "php", rb: "ruby",
  sh: "shell", bash: "shell", sql: "sql", css: "css", scss: "css",
  json: "json", yaml: "yaml", yml: "yaml", html: "markup", htm: "markup", xml: "markup", vue: "markup", svg: "markup",
};

// 색칠할 언어 이름(없으면 null — txt/md/csv/log처럼 그냥 글로 보여 줄 파일).
export function codeLanguageOf(name: string): string | null {
  return LANGUAGE_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

const wordSets = new Map<string, Set<string>>();
function wordsOf(lang: string, spec: LangSpec): Set<string> {
  let set = wordSets.get(lang);
  if (!set) {
    const words = spec.keywords.split(" ").filter(Boolean);
    set = new Set(spec.ignoreCase ? words.map((w) => w.toLowerCase()) : words);
    wordSets.set(lang, set);
  }
  return set;
}

const WORD = /[A-Za-z_$][\w$]*/y;
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)[A-Za-z%]*/y;
const TAG_NAME = /<[/!?]?[\w:.-]*/y;
const ATTR_NAME = /[\w:.@-]+/y;
const isWordChar = (ch: string | undefined) => !!ch && /[\w$]/.test(ch);

function stringEnd(text: string, start: number, quote: string, multiline: boolean): number {
  let j = start + quote.length;
  while (j < text.length) {
    if (text[j] === "\\") { j += 2; continue; }
    if (text.startsWith(quote, j)) return j + quote.length;
    if (!multiline && text[j] === "\n") return j;
    j++;
  }
  return text.length;
}

function atLineStart(text: string, index: number): boolean {
  for (let j = index - 1; j >= 0; j--) {
    if (text[j] === "\n") return true;
    if (text[j] !== " " && text[j] !== "\t") return false;
  }
  return true;
}

export function tokenizeCode(text: string, lang: string): CodeToken[] {
  const spec = LANGS[lang];
  if (!spec) return [{ text, kind: null }];
  const words = wordsOf(lang, spec);
  const out: CodeToken[] = [];
  let plainStart = 0;
  let i = 0;
  const push = (end: number, kind: CodeTokenKind) => {
    if (plainStart < i) out.push({ text: text.slice(plainStart, i), kind: null });
    out.push({ text: text.slice(i, end), kind });
    i = end;
    plainStart = end;
  };
  const lineEnd = (from: number) => { const n = text.indexOf("\n", from); return n < 0 ? text.length : n; };
  const matchAt = (re: RegExp) => { re.lastIndex = i; return re.exec(text)?.[0] ?? ""; };

  while (i < text.length) {
    const ch = text[i];
    if (spec.markup) {
      if (text.startsWith("<!--", i)) { const e = text.indexOf("-->", i + 4); push(e < 0 ? text.length : e + 3, "comment"); continue; }
      if (ch === "<" && /[A-Za-z/!?]/.test(text[i + 1] ?? "")) {
        push(i + matchAt(TAG_NAME).length, "tag");
        while (i < text.length && text[i] !== ">" && text[i] !== "<") {
          if (text[i] === '"' || text[i] === "'") push(stringEnd(text, i, text[i], true), "string");
          else if (/[\w:@-]/.test(text[i])) push(i + matchAt(ATTR_NAME).length, "attr");
          else i++;
        }
        if (text[i] === ">") push(i + 1, "tag");
        continue;
      }
      i++;
      continue;
    }
    if (spec.block && text.startsWith(spec.block[0], i)) {
      const e = text.indexOf(spec.block[1], i + spec.block[0].length);
      push(e < 0 ? text.length : e + spec.block[1].length, "comment");
      continue;
    }
    if (spec.line?.some((m) => text.startsWith(m, i))) { push(lineEnd(i), "comment"); continue; }
    if (spec.preprocessor && ch === "#" && atLineStart(text, i)) { push(lineEnd(i), "meta"); continue; }
    const quote = spec.quotes.find((q) => text.startsWith(q, i));
    if (quote) { push(stringEnd(text, i, quote, quote.length === 3 || quote === "`"), "string"); continue; }
    const prev = text[i - 1];
    if (spec.annotations && ch === "@" && /[A-Za-z_]/.test(text[i + 1] ?? "") && !isWordChar(prev)) {
      WORD.lastIndex = i + 1;
      push(i + 1 + (WORD.exec(text)?.[0].length ?? 0), "meta");
      continue;
    }
    if (/\d/.test(ch) && !isWordChar(prev)) { push(i + matchAt(NUMBER).length, "number"); continue; }
    if (/[A-Za-z_$]/.test(ch) && !isWordChar(prev)) {
      const word = matchAt(WORD);
      if (words.has(spec.ignoreCase ? word.toLowerCase() : word)) push(i + word.length, "keyword");
      else if (spec.capsTypes && /^[A-Z]/.test(word) && /[a-z]/.test(word)) push(i + word.length, "type");
      else i += word.length;
      continue;
    }
    i++;
  }
  if (plainStart < text.length) out.push({ text: text.slice(plainStart), kind: null });
  return out;
}

// 토큰을 줄 단위로 나눈다(화면에서 바뀐 줄만 다시 그리기 위해). 줄바꿈 문자는 포함하지 않는다.
export function tokenLines(tokens: CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    parts.forEach((part, k) => {
      if (k > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: token.kind });
    });
  }
  return lines;
}
