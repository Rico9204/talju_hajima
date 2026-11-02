import { memo, useMemo } from "react";
import { tokenizeCode, tokenLines, type CodeToken } from "../lib/codeHighlight";

// 코드 문법 색칠 글. 줄마다 나눠 그려서 한 글자를 고쳐도 바뀐 줄만 다시 그린다.
// 바깥 요소에 white-space: pre-wrap을 주면 원문과 같은 위치에 같은 줄바꿈으로 놓인다.
export default function CodeHighlight({ text, language }: { text: string; language: string }) {
  const lines = useMemo(() => tokenLines(tokenizeCode(text, language)), [text, language]);
  return <>{lines.map((tokens, i) => <CodeLine key={i} tokens={tokens} sig={signature(tokens)} last={i === lines.length - 1} />)}</>;
}

function signature(tokens: CodeToken[]): string {
  let s = "";
  for (const t of tokens) s += (t.kind ?? "") + "\u0000" + t.text + "\u0001";
  return s;
}

const CodeLine = memo(function CodeLine({ tokens, last }: { tokens: CodeToken[]; sig: string; last: boolean }) {
  return <>{tokens.map((t, k) => t.kind ? <span key={k} className={`code-${t.kind}`}>{t.text}</span> : t.text)}{!last && "\n"}</>;
}, (a, b) => a.sig === b.sig && a.last === b.last);
