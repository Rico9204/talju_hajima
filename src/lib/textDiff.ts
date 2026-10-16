// 버전 "페이지" 보기용 줄 단위 diff. (Temporary_Merge 브랜치의 Workspace.tsx에서 이식)
export interface DiffLine {
  type: "add" | "remove" | "same";
  text: string;
}

// 간단한 LCS 기반 라인 diff (별도 라이브러리 없이 O(n*m)).
// ponytail: 아주 긴 텍스트(수만 줄)는 느릴 수 있어 호출부에서 크기를 제한한다.
// CRLF(\r\n)로 저장된 버전과 LF(\n)로 저장된 버전을 비교하면, "\n" 기준으로만 나눴을 때 CRLF
// 쪽 줄 끝에 보이지 않는 "\r"이 남아서 눈엔 똑같아 보이는 줄이 서로 다른 문자열로 비교된다 —
// 그 결과가 "삭제 후 내용이 똑같은 줄을 다시 추가"처럼 보이는 diff. 줄바꿈 문자를 통일해서 나눠
// 이 문제를 원천에서 막는다.
function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  // 파일이 개행으로 끝나면 split이 마지막에 빈 문자열 원소를 하나 더 만든다 — 한쪽 버전만
  // 파일 끝 개행 유무가 다르면(에디터가 저장할 때 자동으로 붙이거나 떼거나), 실제 내용은
  // 같은데 "빈 줄이 추가/삭제됨"처럼 보이는 원인이 된다. 그 인공적인 빈 원소 하나만 제거.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// 줄 diff와 (아래) 줄 안 단어 diff가 똑같은 LCS 로직을 쓰므로, 비교 대상 배열만 바꿔 끼울 수
// 있게 공통 코어로 뽑아둠.
function computeLcsDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "remove", text: a[i] });
      i++;
    } else {
      result.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "remove", text: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: "add", text: b[j] });
    j++;
  }
  return collapseNoOpPairs(result);
}

// LCS diff는 줄 내용이 중복될 때 종종 "지우고 똑같은 내용을 바로 다시 씀" 같은 잘못된 정렬을
// 만든다 — 실제로는 안 바뀐 줄인데 remove+add 쌍으로 나오는 것. 같은 변경 덩어리(remove들 뒤에
// add들이 이어지는 구간) 안에서 텍스트가 완전히 같은 remove/add를 찾아 서로 상쇄시켜서 진짜
// 바뀐 줄만 남긴다.
function collapseNoOpPairs(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "same") {
      result.push(lines[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].type !== "same") j++;
    const block = lines.slice(i, j);

    const removeIdxByText = new Map<string, number[]>();
    block.forEach((l, idx) => {
      if (l.type !== "remove") return;
      const arr = removeIdxByText.get(l.text) ?? [];
      arr.push(idx);
      removeIdxByText.set(l.text, arr);
    });

    const skip = new Set<number>();
    block.forEach((l, idx) => {
      if (l.type !== "add") return;
      const candidates = removeIdxByText.get(l.text);
      if (candidates && candidates.length > 0) {
        skip.add(candidates.shift()!);
        skip.add(idx);
      }
    });

    block.forEach((l, idx) => {
      if (!skip.has(idx)) result.push(l);
    });
    i = j;
  }
  return result;
}

function diffLines(oldText: string, newText: string): DiffLine[] {
  return computeLcsDiff(splitLines(oldText), splitLines(newText));
}

export interface FullTextDiffLine {
  text: string;
  changed: boolean;
  // 이 줄이 이전 버전의 어떤 줄을 고쳐 쓴 것이면(remove+add 쌍) 그 이전 내용을 담아 호버 시
  // 보여준다. 완전히 새로 생긴 줄이면 null(비교할 이전 내용이 없다는 뜻).
  oldText: string | null;
}

// "페이지" 보기용 — diff 결과에서 remove만 있는 줄(새 버전엔 없는 줄)은 건너뛰고, same/add 줄을
// 순서대로 이어 붙여 "새 버전의 전체 내용"을 그대로 복원하면서, 바뀐 줄만 changed=true로 표시한다.
export function buildFullTextDiff(oldText: string, newText: string): FullTextDiffLine[] {
  const raw = diffLines(oldText, newText);
  const result: FullTextDiffLine[] = [];
  let i = 0;
  while (i < raw.length) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (cur.type === "same") {
      result.push({ text: cur.text, changed: false, oldText: null });
      i += 1;
    } else if (cur.type === "remove" && next?.type === "add") {
      result.push({ text: next.text, changed: true, oldText: cur.text });
      i += 2;
    } else if (cur.type === "add") {
      result.push({ text: cur.text, changed: true, oldText: null });
      i += 1;
    } else {
      // remove만 있고 이어지는 add가 없음 — 새 버전엔 없는 줄이라 표시할 자리가 없어 건너뜀
      i += 1;
    }
  }
  return result;
}

