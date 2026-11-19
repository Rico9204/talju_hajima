// HWP equation parser and MathML converter
export function parseHwpEquation(rawScript: string): string {
  if (!rawScript || !rawScript.trim()) {
    return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mtext style="color:#94a3b8;font-style:italic">수식을 입력하세요</mtext></math>`;
  }

  let s = rawScript.trim();

  // 1. LaTeX 호환 변환 (\frac{a}{b} -> {a} over {b}, \sqrt{a} -> sqrt {a})
  s = s.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "{$1} over {$2}");
  s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt {$1}");
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");

  // 2. 그리스 문자 사전 (소문자 & 대문자)
  const GREEK_MAP: Record<string, string> = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
    eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
    nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigma: "σ",
    tau: "τ", upsilon: "υ", phi: "ϕ", chi: "χ", psi: "ψ", omega: "ω",
    ALPHA: "Α", BETA: "Β", GAMMA: "Γ", DELTA: "Δ", THETA: "Θ", LAMBDA: "Λ",
    XI: "Ξ", PI: "Π", SIGMA: "Σ", UPSILON: "Υ", PHI: "Φ", PSI: "Ψ", OMEGA: "Ω",
  };

  // 3. 연산자 및 기호 사전
  const SYMBOL_MAP: Record<string, string> = {
    times: "×", TIMES: "×",
    div: "÷", DIV: "÷",
    pm: "±", PM: "±", "+-": "±",
    mp: "∓", MP: "∓", "-+": "∓",
    leq: "≤", LEQ: "≤", "<=": "≤",
    geq: "≥", GEQ: "≥", ">=": "≥",
    neq: "≠", NEQ: "≠", "!=": "≠",
    approx: "≈", APPROX: "≈",
    equiv: "≡", EQUIV: "≡",
    sim: "∼", SIM: "∼",
    prop: "∝", PROP: "∝",
    infty: "∞", inft: "∞", INF: "∞", INFTY: "∞",
    cdot: "·", CDOT: "·",
    cdots: "⋯", CDOTS: "⋯",
    ldots: "…", LDOTS: "…",
    vdots: "⋮", VDOTS: "⋮",
    ddots: "⋱", DDOTS: "⋱",
    to: "→", "->": "→",
    leftarrow: "←", "<-": "←",
    iff: "⇔", "<=>": "⇔",
    subset: "⊂", SUBSET: "⊂",
    supset: "⊃", SUPSET: "⊃",
    subseteq: "⊆", SUBSETEQ: "⊆",
    supseteq: "⊇", SUPSETEQ: "⊇",
    cap: "∩", CAP: "∩",
    cup: "∪", CUP: "∪",
    in: "∈", IN: "∈",
    notin: "∉", NOTIN: "∉",
    emptyset: "∅", EMPTYSET: "∅",
    therefore: "∴", THEREFORE: "∴",
    because: "∵", BECAUSE: "∵",
    forall: "∀", FORALL: "∀",
    exists: "∃", EXISTS: "∃",
    partial: "∂", PARTIAL: "∂",
    nabla: "∇", NABLA: "∇",
    hbar: "ℏ", HBAR: "ℏ",
    deg: "°", DEG: "°",
    prime: "′", PRIME: "′",
  };

  // 4. 거대 연산자 (sum, int, lim, prod)
  const BIG_OPS: Record<string, string> = {
    sum: "∑", SUM: "∑",
    int: "∫", INT: "∫",
    oint: "∮", OINT: "∮",
    prod: "∏", PROD: "∏",
    lim: "lim", LIM: "lim",
  };

  // 재귀적 MathML 변환기
  function convertToMathML(expr: string): string {
    let text = expr.trim();
    if (!text) return "";

    // A. 분수: {num} over {den} 또는 num over den
    // HWP에서 over는 앞뒤의 블록(중괄호 묶음 또는 단일 토큰)을 분자와 분모로 묶습니다.
    if (/\b(?:over|OVER)\b/.test(text)) {
      const overIdx = findTopLevelKeyword(text, ["over"]);
      if (overIdx !== -1) {
        const beforeText = text.slice(0, overIdx).trimEnd();
        const afterText = text.slice(overIdx + 4).trimStart();

        let num = "";
        let beforePrefix = "";
        if (beforeText.endsWith("}")) {
          const lastOpen = findMatchingBraceReverse(beforeText, beforeText.length - 1);
          if (lastOpen !== -1) {
            num = unwrapBraces(beforeText.slice(lastOpen));
            beforePrefix = beforeText.slice(0, lastOpen).trimEnd();
          } else {
            num = beforeText;
          }
        } else {
          const m = beforeText.match(/([a-zA-Z0-9_.\^]+)$/);
          if (m) {
            num = m[1];
            beforePrefix = beforeText.slice(0, beforeText.length - m[1].length).trimEnd();
          } else {
            num = beforeText;
          }
        }

        let den = "";
        let afterSuffix = "";
        if (afterText.startsWith("{")) {
          const closeIdx = findMatchingBrace(afterText, 0);
          if (closeIdx !== -1) {
            den = unwrapBraces(afterText.slice(0, closeIdx + 1));
            afterSuffix = afterText.slice(closeIdx + 1).trimStart();
          } else {
            den = afterText;
          }
        } else {
          const m = afterText.match(/^([a-zA-Z0-9_.\^]+)/);
          if (m) {
            den = m[1];
            afterSuffix = afterText.slice(m[1].length).trimStart();
          } else {
            den = afterText;
          }
        }

        const fracXml = `<mfrac><mrow>${convertToMathML(num)}</mrow><mrow>${convertToMathML(den)}</mrow></mfrac>`;
        return `${beforePrefix ? convertToMathML(beforePrefix) : ""}${fracXml}${afterSuffix ? convertToMathML(afterSuffix) : ""}`;
      }
    }

    // B. 거대 연산자 및 극한: sum_{i=1}^n, int_0^infty, lim_{x->0}
    // 예: sum _{...} ^{...}
    const bigOpMatch = text.match(/^(sum|SUM|int|INT|oint|OINT|prod|PROD|lim|LIM)\s*(?:_(\{[^{}]+\}|[a-zA-Z0-9]+))?\s*(?:\^(\{[^{}]+\}|[a-zA-Z0-9]+))?\s*(.*)$/);
    if (bigOpMatch) {
      const op = BIG_OPS[bigOpMatch[1]] || bigOpMatch[1];
      const sub = bigOpMatch[2] ? unwrapBraces(bigOpMatch[2]) : "";
      const sup = bigOpMatch[3] ? unwrapBraces(bigOpMatch[3]) : "";
      const rest = bigOpMatch[4] || "";

      let opXml = "";
      if (sub && sup) {
        opXml = `<munderover><mo style="font-size:1.3em">${op}</mo><mrow>${convertToMathML(sub)}</mrow><mrow>${convertToMathML(sup)}</mrow></munderover>`;
      } else if (sub) {
        opXml = `<munder><mo style="font-size:1.3em">${op}</mo><mrow>${convertToMathML(sub)}</mrow></munder>`;
      } else if (sup) {
        opXml = `<mover><mo style="font-size:1.3em">${op}</mo><mrow>${convertToMathML(sup)}</mrow></mover>`;
      } else {
        opXml = `<mo style="font-size:1.3em">${op}</mo>`;
      }
      return `${opXml}${rest ? convertToMathML(rest) : ""}`;
    }

    // C. 제곱근: sqrt {x} 또는 root n of {x}
    const rootMatch = text.match(/^root\s+(\{[^{}]+\}|[a-zA-Z0-9]+)\s+of\s+(\{[^{}]+\}|[a-zA-Z0-9]+)\s*(.*)$/i);
    if (rootMatch) {
      const n = unwrapBraces(rootMatch[1]);
      const x = unwrapBraces(rootMatch[2]);
      const rest = rootMatch[3] || "";
      return `<mroot><mrow>${convertToMathML(x)}</mrow><mrow>${convertToMathML(n)}</mrow></mroot>${rest ? convertToMathML(rest) : ""}`;
    }

    const sqrtMatch = text.match(/^sqrt\s*(\{[^{}]+\}|[a-zA-Z0-9]+)\s*(.*)$/i);
    if (sqrtMatch) {
      const inside = unwrapBraces(sqrtMatch[1]);
      const rest = sqrtMatch[2] || "";
      return `<msqrt><mrow>${convertToMathML(inside)}</mrow></msqrt>${rest ? convertToMathML(rest) : ""}`;
    }

    // D. 괄호: left( ... right) 또는 left{ ... right} 또는 left[ ... right]
    const bracketMatch = text.match(/^left([(\[{|])\s*(.*?)\s*right([)\]}|])\s*(.*)$/i);
    if (bracketMatch) {
      const open = bracketMatch[1];
      const inner = bracketMatch[2];
      const close = bracketMatch[3];
      const rest = bracketMatch[4] || "";
      return `<mrow><mo>${open}</mo><mrow>${convertToMathML(inner)}</mrow><mo>${close}</mo></mrow>${rest ? convertToMathML(rest) : ""}`;
    }

    // E. 첨자: x_{1}^2 또는 x_1 또는 x^2
    // 토큰 단위로 순회하여 파싱
    let xml = "";
    let i = 0;
    while (i < text.length) {
      // 공백 처리
      if (/\s/.test(text[i])) {
        i++;
        continue;
      }

      // HWP 공백 문자: ~ (넓은 공백), ` (얇은 공백)
      if (text[i] === "~") {
        xml += `<mspace width="0.8em"/>`;
        i++;
        continue;
      }
      if (text[i] === "`") {
        xml += `<mspace width="0.3em"/>`;
        i++;
        continue;
      }

      // 중괄호 블록
      if (text[i] === "{") {
        const closeIdx = findMatchingBrace(text, i);
        if (closeIdx !== -1) {
          const inner = text.slice(i + 1, closeIdx);
          let innerXml = `<mrow>${convertToMathML(inner)}</mrow>`;
          i = closeIdx + 1;
          // 뒤이어 나오는 첨자 확인
          const subSup = parseSubSup(text, i);
          if (subSup) {
            innerXml = wrapSubSup(innerXml, subSup.sub, subSup.sup);
            i = subSup.nextIdx;
          }
          xml += innerXml;
          continue;
        }
      }

      // 단어 또는 기호 토큰 추출
      const tokenMatch = text.slice(i).match(/^([a-zA-Z]+|[0-9]+(?:\.[0-9]+)?|<=|>=|!=|\+-|-\+|->|<-|<=>|\S)/);
      if (!tokenMatch) {
        i++;
        continue;
      }

      const tok = tokenMatch[1];
      let tokLen = tok.length;
      let tokXml = "";

      if (tok.toLowerCase() === "sqrt") {
        let inside = "";
        let nextIdx = i + tokLen;
        while (nextIdx < text.length && /\s/.test(text[nextIdx])) nextIdx++;
        if (text[nextIdx] === "{") {
          const close = findMatchingBrace(text, nextIdx);
          if (close !== -1) {
            inside = text.slice(nextIdx + 1, close);
            tokLen = close + 1 - i;
          }
        } else {
          const m = text.slice(nextIdx).match(/^([a-zA-Z0-9]+)/);
          if (m) {
            inside = m[1];
            tokLen = (nextIdx + m[1].length) - i;
          }
        }
        xml += `<msqrt><mrow>${convertToMathML(inside)}</mrow></msqrt>`;
        i += tokLen;
        continue;
      }

      if (GREEK_MAP[tok]) {
        tokXml = `<mi>${GREEK_MAP[tok]}</mi>`;
      } else if (SYMBOL_MAP[tok]) {
        tokXml = `<mo>${SYMBOL_MAP[tok]}</mo>`;
      } else if (/^[0-9]+(?:\.[0-9]+)?$/.test(tok)) {
        tokXml = `<mn>${tok}</mn>`;
      } else if (/^[a-zA-Z]+$/.test(tok)) {
        // 단어인 경우 (예: sin, cos, tan, log 등 함수명 또는 일반 변수)
        if (/^(sin|cos|tan|cot|sec|csc|log|ln|exp|max|min|det|deg)$/i.test(tok)) {
          tokXml = `<mi mathvariant="normal">${tok}</mi>`;
        } else if (tok.length === 1) {
          tokXml = `<mi>${tok}</mi>`;
        } else {
          tokXml = `<mi>${tok}</mi>`;
        }
      } else if (tok === "+" || tok === "-" || tok === "=" || tok === "<" || tok === ">" || tok === "," || tok === ";") {
        // 결과는 dangerouslySetInnerHTML로 그려지고 수식은 공동 편집으로 남이 넣을 수 있으므로 < > 도 이스케이프한다.
        tokXml = `<mo>${escapeXml(tok)}</mo>`;
      } else if (tok === "(" || tok === ")" || tok === "[" || tok === "]" || tok === "|" || tok === "/") {
        tokXml = `<mo>${tok}</mo>`;
      } else {
        tokXml = `<mo>${escapeXml(tok)}</mo>`;
      }

      // 첨자 (^ 또는 _) 확인
      const subSup = parseSubSup(text, i + tokLen);
      if (subSup) {
        tokXml = wrapSubSup(tokXml, subSup.sub, subSup.sup);
        tokLen = subSup.nextIdx - i;
      }

      xml += tokXml;
      i += tokLen;
    }

    return xml;
  }

  function unwrapBraces(str: string): string {
    const s = str.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      return s.slice(1, -1).trim();
    }
    return s;
  }

  function findMatchingBrace(str: string, startIdx: number): number {
    let depth = 0;
    for (let i = startIdx; i < str.length; i++) {
      if (str[i] === "{") depth++;
      else if (str[i] === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function findMatchingBraceReverse(str: string, endIdx: number): number {
    let depth = 0;
    for (let i = endIdx; i >= 0; i--) {
      if (str[i] === "}") depth++;
      else if (str[i] === "{") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function findTopLevelKeyword(str: string, keywords: string[]): number {
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "{") depth++;
      else if (str[i] === "}") depth--;
      else if (depth === 0) {
        for (const kw of keywords) {
          if (str.slice(i, i + kw.length).toLowerCase() === kw.toLowerCase()) {
            const before = i === 0 || /\s|\}/.test(str[i - 1]);
            const after = i + kw.length >= str.length || /\s|\{/.test(str[i + kw.length]);
            if (before && after) return i;
          }
        }
      }
    }
    return -1;
  }

  function parseSubSup(str: string, startIdx: number): { sub?: string; sup?: string; nextIdx: number } | null {
    let idx = startIdx;
    let sub: string | undefined;
    let sup: string | undefined;
    let found = false;

    while (idx < str.length) {
      if (/\s/.test(str[idx])) {
        idx++;
        continue;
      }
      if (str[idx] === "_" && sub === undefined) {
        found = true;
        idx++;
        while (idx < str.length && /\s/.test(str[idx])) idx++;
        if (str[idx] === "{") {
          const close = findMatchingBrace(str, idx);
          if (close !== -1) {
            sub = str.slice(idx + 1, close);
            idx = close + 1;
            continue;
          }
        }
        const m = str.slice(idx).match(/^([a-zA-Z0-9]+)/);
        if (m) {
          sub = m[1];
          idx += m[1].length;
          continue;
        }
      } else if (str[idx] === "^" && sup === undefined) {
        found = true;
        idx++;
        while (idx < str.length && /\s/.test(str[idx])) idx++;
        if (str[idx] === "{") {
          const close = findMatchingBrace(str, idx);
          if (close !== -1) {
            sup = str.slice(idx + 1, close);
            idx = close + 1;
            continue;
          }
        }
        const m = str.slice(idx).match(/^([a-zA-Z0-9]+)/);
        if (m) {
          sup = m[1];
          idx += m[1].length;
          continue;
        }
      }
      break;
    }

    if (!found) return null;
    return { sub, sup, nextIdx: idx };
  }

  function wrapSubSup(baseXml: string, sub?: string, sup?: string): string {
    const subXml = sub !== undefined ? `<mrow>${convertToMathML(sub)}</mrow>` : "";
    const supXml = sup !== undefined ? `<mrow>${convertToMathML(sup)}</mrow>` : "";
    if (subXml && supXml) {
      return `<msubsup>${baseXml}${subXml}${supXml}</msubsup>`;
    }
    if (subXml) {
      return `<msub>${baseXml}${subXml}</msub>`;
    }
    if (supXml) {
      return `<msup>${baseXml}${supXml}</msup>`;
    }
    return baseXml;
  }

  function escapeXml(str: string): string {
    return str.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" }[c] ?? c));
  }

  const innerMathML = convertToMathML(s);
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" class="hwpx-rendered-equation">${innerMathML}</math>`;
}

export interface EquationTemplateItem {
  label: string;
  template: string;
  preview: string;
}

export const HWPX_EQUATION_TEMPLATES: EquationTemplateItem[] = [
  { label: "분수", template: "{a} over {b}", preview: "a/b" },
  { label: "제곱근", template: "sqrt {x}", preview: "√x" },
  { label: "n제곱근", template: "root {n} of {x}", preview: "ⁿ√x" },
  { label: "위첨자", template: "x^{2}", preview: "x²" },
  { label: "아래첨자", template: "x_{1}", preview: "x₁" },
  { label: "위아래첨자", template: "x_{1}^{2}", preview: "x₁²" },
  { label: "합(시그마)", template: "sum_{i=1}^{n} x_i", preview: "∑" },
  { label: "정적분", template: "int_{a}^{b} f(x) dx", preview: "∫ₐᵇ" },
  { label: "부정적분", template: "int f(x) dx", preview: "∫" },
  { label: "극한", template: "lim_{x -> 0} f(x)", preview: "lim" },
  { label: "곱", template: "prod_{k=1}^{n} a_k", preview: "∏" },
  { label: "괄호", template: "left( {a} over {b} right)", preview: "(a/b)" },
  { label: "절댓값", template: "left| x right|", preview: "|x|" },
];

export const HWPX_OPERATOR_SYMBOLS: { symbol: string; script: string; label: string }[] = [
  { symbol: "+", script: "+", label: "더하기" },
  { symbol: "-", script: "-", label: "빼기" },
  { symbol: "×", script: "times", label: "곱하기" },
  { symbol: "÷", script: "div", label: "나누기" },
  { symbol: "±", script: "+-", label: "플러스마이너스" },
  { symbol: "∓", script: "-+", label: "마이너스플러스" },
  { symbol: "=", script: "=", label: "같음" },
  { symbol: "≠", script: "!=", label: "같지 않음" },
  { symbol: "≤", script: "<=", label: "작거나 같음" },
  { symbol: "≥", script: ">=", label: "크거나 같음" },
  { symbol: "≈", script: "approx", label: "근사" },
  { symbol: "≡", script: "equiv", label: "합동" },
  { symbol: "∝", script: "prop", label: "비례" },
  { symbol: "∞", script: "infty", label: "무한대" },
  { symbol: "·", script: "cdot", label: "가운데점" },
  { symbol: "⋯", script: "cdots", label: "줄임표" },
  { symbol: "→", script: "->", label: "오른쪽 화살표" },
  { symbol: "←", script: "<-", label: "왼쪽 화살표" },
  { symbol: "⇔", script: "<=>", label: "동치 화살표" },
  { symbol: "∈", script: "in", label: "원소" },
  { symbol: "∉", script: "notin", label: "원소 아님" },
  { symbol: "⊂", script: "subset", label: "부분집합" },
  { symbol: "⊃", script: "supset", label: "상위집합" },
  { symbol: "∩", script: "cap", label: "교집합" },
  { symbol: "∪", script: "cup", label: "합집합" },
  { symbol: "∅", script: "emptyset", label: "공집합" },
  { symbol: "∴", script: "therefore", label: "그러므로" },
  { symbol: "∵", script: "because", label: "왜냐하면" },
  { symbol: "∂", script: "partial", label: "편미분" },
  { symbol: "∇", script: "nabla", label: "나블라" },
  { symbol: "°", script: "deg", label: "도" },
  { symbol: "′", script: "prime", label: "프라임" },
];

export const HWPX_GREEK_SYMBOLS: { symbol: string; script: string; label: string }[] = [
  { symbol: "α", script: "alpha", label: "알파" },
  { symbol: "β", script: "beta", label: "베타" },
  { symbol: "γ", script: "gamma", label: "감마" },
  { symbol: "δ", script: "delta", label: "델타" },
  { symbol: "ε", script: "epsilon", label: "엡실론" },
  { symbol: "θ", script: "theta", label: "세타" },
  { symbol: "λ", script: "lambda", label: "람다" },
  { symbol: "μ", script: "mu", label: "뮤" },
  { symbol: "π", script: "pi", label: "파이" },
  { symbol: "ρ", script: "rho", label: "로" },
  { symbol: "σ", script: "sigma", label: "시그마" },
  { symbol: "τ", script: "tau", label: "타우" },
  { symbol: "ϕ", script: "phi", label: "파이" },
  { symbol: "ω", script: "omega", label: "오메가" },
  { symbol: "Δ", script: "DELTA", label: "대문자 델타" },
  { symbol: "Θ", script: "THETA", label: "대문자 세타" },
  { symbol: "Λ", script: "LAMBDA", label: "대문자 람다" },
  { symbol: "Σ", script: "SIGMA", label: "대문자 시그마" },
  { symbol: "Φ", script: "PHI", label: "대문자 파이" },
  { symbol: "Ω", script: "OMEGA", label: "대문자 오메가" },
];

