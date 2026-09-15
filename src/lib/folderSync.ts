// 제품개발/frontend/src/lib/folderSync.ts를 그대로 이식 — 브라우저 File System Access API로
// 로컬 폴더와 워크스페이스를 양방향 동기화하는 데 쓰는 순수 헬퍼들 (React 의존성 없음).

export const MAX_FILE_SIZE = 10_000_000; // 10MB, 텍스트 파일 기준 (서버 body 크기 제한 20mb에 맞춤)
const SKIP_NAMES = new Set(["node_modules", ".git", ".DS_Store"]);

export interface FolderReadResult {
  files: { path: string; content: string }[];
  skipped: string[];
}

export function isFolderSyncSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts: { mode: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  return picker({ mode: "readwrite" });
}

export async function hasReadWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permissioned = handle as unknown as {
    queryPermission(opts: { mode: "readwrite" }): Promise<"granted" | "denied" | "prompt">;
  };
  if (typeof permissioned.queryPermission !== "function") return true;
  const status = await permissioned.queryPermission({ mode: "readwrite" });
  return status === "granted";
}

export async function readFolder(rootHandle: FileSystemDirectoryHandle): Promise<FolderReadResult> {
  const files: { path: string; content: string }[] = [];
  const skipped: string[] = [];
  await walk(rootHandle, "", files, skipped);
  return { files, skipped };
}

export async function writeFile(rootHandle: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const segments = path.split("/");
  const fileName = segments.pop();
  if (!fileName) return;

  let dir = rootHandle;
  for (const segment of segments) {
    dir = await (
      dir as unknown as {
        getDirectoryHandle(name: string, opts: { create: boolean }): Promise<FileSystemDirectoryHandle>;
      }
    ).getDirectoryHandle(segment, { create: true });
  }

  const fileHandle = await (
    dir as unknown as {
      getFileHandle(name: string, opts: { create: boolean }): Promise<FileSystemFileHandle>;
    }
  ).getFileHandle(fileName, { create: true });

  const writable = await (
    fileHandle as unknown as {
      createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
    }
  ).createWritable();
  await writable.write(content);
  await writable.close();
}

async function walk(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string,
  files: { path: string; content: string }[],
  skipped: string[],
): Promise<void> {
  const entries = (
    dirHandle as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
    }
  ).entries();

  for await (const [name, handle] of entries) {
    if (name.startsWith(".") || SKIP_NAMES.has(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === "directory") {
      await walk(handle as FileSystemDirectoryHandle, path, files, skipped);
    } else {
      const fileHandle = handle as FileSystemFileHandle;
      // getFile()과 text() 둘 다 한 try 안에 있어야 한다 — 에디터가 저장할 때 흔히 쓰는
      // "임시 파일에 쓰고 원본으로 rename" 방식은 그 찰나에 getFile()이 NotFoundError 등으로
      // 실패할 수 있다. 이게 walk() 밖으로 새어나가면 runSync()의 catch까지 올라가 동기화
      // 전체가 중단되고 자동 동기화가 꺼져버린다 — 파일 하나를 이번 주기에 건너뛰는 것으로
      // 충분하니 여기서 잡아야 한다.
      try {
        const file = await fileHandle.getFile();
        if (file.size > MAX_FILE_SIZE) {
          skipped.push(path);
          continue;
        }
        const content = await file.text();
        files.push({ path, content });
      } catch {
        skipped.push(path);
      }
    }
  }
}
