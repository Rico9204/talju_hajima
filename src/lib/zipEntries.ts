// .zip은 미리 볼 내용이 없으니 안에 든 파일 목록을 보여 준다(Temporary_Merge의 ZIP 목록 보기).
// 압축을 풀지 않고 파일 끝의 목록(중앙 디렉터리)만 읽는다 — 큰 압축 파일도 끝부분 일부만 읽으면 된다.

export interface ZipEntry {
  path: string;
  size: number; // 압축 전 크기(바이트)
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_COMMENT = 0xffff;
const MAX_ENTRIES = 5000;

// 한국어 Windows에서 만든 zip은 이름이 UTF-8 표시(0x800) 없이 CP949로 저장되는 경우가 많다.
function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return new TextDecoder("utf-8").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try { return new TextDecoder("euc-kr").decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); }
  }
}

export async function listZipEntries(blob: Blob): Promise<ZipEntry[]> {
  // 끝부분(목록 끝 표시 22바이트 + 주석 최대 64KB)에서 목록 위치를 찾는다.
  const tailStart = Math.max(0, blob.size - (22 + MAX_COMMENT));
  const tail = new DataView(await blob.slice(tailStart).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP 파일이 아니거나 손상되었습니다.");
  const count = tail.getUint16(eocd + 10, true);
  const dirSize = tail.getUint32(eocd + 12, true);
  const dirOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    throw new Error("4GB가 넘는 형식(ZIP64)의 목록은 아직 볼 수 없습니다.");
  }
  if (dirOffset + dirSize > blob.size) throw new Error("ZIP 파일이 아니거나 손상되었습니다.");

  const dir = new DataView(await blob.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count && n < MAX_ENTRIES && p + 46 <= dir.byteLength; n++) {
    if (dir.getUint32(p, true) !== CENTRAL_SIGNATURE) break;
    const flags = dir.getUint16(p + 8, true);
    const size = dir.getUint32(p + 24, true);
    const nameLength = dir.getUint16(p + 28, true);
    const extraLength = dir.getUint16(p + 30, true);
    const commentLength = dir.getUint16(p + 32, true);
    // Windows PowerShell의 Compress-Archive는 폴더 구분을 역슬래시로 저장한다 → /로 통일.
    const name = decodeName(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength), (flags & 0x800) !== 0).replace(/\\/g, "/");
    if (!name.endsWith("/")) entries.push({ path: name, size }); // 폴더 항목은 빼고 파일만
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function formatZipSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 버전 비교용: 한 파일당 한 줄(줄 단위 비교에서 추가·삭제·크기 변경이 드러난다).
export function zipEntriesText(entries: ZipEntry[]): string {
  return entries.map((e) => `${e.path} (${formatZipSize(e.size)})`).join("\n");
}
