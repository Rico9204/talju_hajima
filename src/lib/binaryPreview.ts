// .pptx는 mammoth/xlsx 같은 전용 뷰어가 없어서, 대신 슬라이드별 텍스트만 뽑아 일반 텍스트
// 버전 비교(diffLines)에 그대로 흘려보낸다 — "무엇이 바뀌었는지" 위주로 보여주는 용도라 서식/
// 이미지/위치 같은 시각적 요소는 못 담지만, 실제 내용 변경은 줄 단위 diff로 정확히 드러난다.
// .zip은 애초에 "미리보기"할 내용이 없으니, 대신 안에 어떤 파일이 들어있는지 목록을 보여준다.

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(",");
  const binaryString = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

export function isPptxPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pptx");
}

export function isZipPath(path: string): boolean {
  return path.toLowerCase().endsWith(".zip");
}

// 슬라이드 1개당 한 문단으로 - diffLines가 "줄" 단위로 비교하므로, 슬라이드 안 여러 텍스트는
// " / "로 이어붙여 한 줄로 만든다(그래야 "슬라이드 3에서 이 부분이 바뀜"이 한 줄 diff로 보임).
export async function extractPptxTextSummary(dataUrl: string): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(dataUrlToArrayBuffer(dataUrl));
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      return na - nb;
    });

  const lines: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i])?.async("string");
    const texts = [...(xml ?? "").matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).filter((t) => t.trim() !== "");
    lines.push(`[슬라이드 ${i + 1}] ${texts.length > 0 ? texts.join(" / ") : "(텍스트 없음)"}`);
  }
  return lines.join("\n");
}

export interface ZipEntry {
  path: string;
  size: number;
}

export async function listZipEntries(dataUrl: string): Promise<ZipEntry[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(dataUrlToArrayBuffer(dataUrl));
  const entries: ZipEntry[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    // JSZip 파일 객체엔 압축 전 크기가 _data.uncompressedSize에 있다(공식 API는 아니지만
    // 안정적으로 쓰이는 내부 필드) - 없으면 0으로 표시.
    const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    entries.push({ path: relativePath, size });
  });
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
