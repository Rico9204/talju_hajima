import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { newHwpxBytes, readZipEntries, writeZipEntries } from "../src/lib/hwpx.ts";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

// 서버 공용 인메모리 파일 저장소
const sharedFiles = [];
const sharedBlobs = new Map();
let nextId = 10;

// 실시간 메시지 큐 (시퀀스 ID 기반 - 유실 없는 100% 전달)
const realtimeMessages = [];
let msgSeq = 0;

function pushRealtimeMessage(payload) {
  const item = { id: ++msgSeq, ts: Date.now(), ...payload };
  realtimeMessages.push(item);
  if (realtimeMessages.length > 300) {
    realtimeMessages.shift();
  }
  return item;
}

// 초기 HWPX 기본 문서 생성
const b = await newHwpxBytes("팀플 최종 보고서 초안입니다.");
const entries = await readZipEntries(b);
entries.set(
  "Contents/section0.xml",
  new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hp:p id="p0"><hp:run><hp:t>팀플 최종 보고서 초안입니다.</hp:t></hp:run></hp:p>
  <hp:p id="p1"><hp:run><hp:t>1. 연구 배경 및 목적: 대학생들의 원활한 한글 문서 협업을 지원합니다.</hp:t></hp:run></hp:p>
  <hp:p id="p2">
    <hp:run>
      <hp:tbl rowCnt="3" colCnt="3" width="10000">
        <hp:tr>
          <hp:tc><hp:p><hp:run><hp:t>구분</hp:t></hp:run></hp:p></hp:tc>
          <hp:tc><hp:p><hp:run><hp:t>담당자</hp:t></hp:run></hp:p></hp:tc>
          <hp:tc><hp:p><hp:run><hp:t>진행 상태</hp:t></hp:run></hp:p></hp:tc>
        </hp:tr>
        <hp:tr>
          <hp:tc><hp:p><hp:run><hp:t>한글 동시편집 에디터</hp:t></hp:run></hp:p></hp:tc>
          <hp:tc><hp:p><hp:run><hp:t>홍길동</hp:t></hp:run></hp:p></hp:tc>
          <hp:tc><hp:p><hp:run><hp:t>개발 완료 (Yjs CRDT)</hp:t></hp:run></hp:p></hp:tc>
        </hp:tr>
        <hp:tr>
          <hp:tc><hp:p><hp:run><hp:t>표/수식 무손실 보존</hp:t></hp:run></hp:p></hp:tc>
          <hp:tc><hp:p><hp:run><hp:t>이순신</hp:t></hp:run></hp:p></hp:tc>
          <hp:tc><hp:p><hp:run><hp:t>검증 완료</hp:t></hp:run></hp:p></hp:tc>
        </hp:tr>
      </hp:tbl>
    </hp:run>
  </hp:p>
  <hp:p id="p3">
    <hp:run>
      <hp:equation version="1.0">
        <hp:script>E = mc^2</hp:script>
      </hp:equation>
    </hp:run>
  </hp:p>
  <hp:p id="p4"><hp:run><hp:t>2. 결론 및 향후 계획: 추가 서식 호환성을 계속 강화해 나갈 예정입니다.</hp:t></hp:run></hp:p>
</hs:sec>`)
);
const complexBytes = await writeZipEntries(entries);
sharedBlobs.set(5, Buffer.from(complexBytes));

sharedFiles.push({
  id: 5,
  name: "팀플_최종보고서.hwpx",
  type: "doc",
  uploader: "기본 파일",
  avatar: "팀",
  date: "2026-09-17",
  size: `${complexBytes.byteLength} B`,
  tag: "보고서",
  tags: ["보고서"],
  folderId: null,
  comments: [],
  versions: [
    {
      id: 5,
      parentVersionId: null,
      current: true,
      version: "v1",
      uploadedBy: "기본 파일",
      date: "2026-09-17",
      size: `${complexBytes.byteLength} B`,
      note: "초안 작성",
      storagePath: "fixture/5",
      originalName: "팀플_최종보고서.hwpx",
      mimeType: "application/hnc+zip",
      byteSize: complexBytes.byteLength,
      pinned: false,
    },
  ],
});

const apiPlugin = () => ({
  name: "fixture-api-plugin",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://localhost:5183");

      // 1. 실시간 메시지 발송
      if (url.pathname === "/fixture-api/realtime/send" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const item = pushRealtimeMessage(payload);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, id: item.id }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
        return;
      }

      // 2. 실시간 메시지 수신 (150ms 고속 폴링)
      if (url.pathname === "/fixture-api/realtime/poll" && req.method === "GET") {
        const since = Number(url.searchParams.get("since") || 0);
        const from = url.searchParams.get("from") || "";

        // since 이후이며 자신이 보낸 것이 아닌 메시지 필터링
        const items = realtimeMessages.filter((m) => m.id > since && (!from || m.from !== from));
        const lastId = realtimeMessages.length > 0 ? realtimeMessages[realtimeMessages.length - 1].id : since;

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache, no-store");
        res.end(JSON.stringify({ items, lastId }));
        return;
      }

      // 3. 파일 목록 조회
      if (url.pathname === "/fixture-api/files" && req.method === "GET") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache, no-store");
        res.end(JSON.stringify(sharedFiles));
        return;
      }

      // 4. 파일 업로드
      if (url.pathname === "/fixture-api/upload" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const id = ++nextId;
            const fileId = payload.fileId || id;
            const buffer = Buffer.from(payload.base64, "base64");
            sharedBlobs.set(id, buffer);

            const v = {
              id,
              parentVersionId: payload.baseVersionId ?? null,
              current: true,
              version: `v${id}`,
              uploadedBy: payload.uploader,
              date: new Date().toISOString().slice(0, 10),
              size: `${buffer.length} B`,
              note: payload.note || "",
              storagePath: `fixture/${id}`,
              originalName: payload.name,
              mimeType: payload.mimeType || "application/octet-stream",
              byteSize: buffer.length,
              pinned: false,
            };

            const existingIdx = sharedFiles.findIndex((f) => f.id === fileId);
            if (existingIdx >= 0) {
              const existing = sharedFiles[existingIdx];
              const branched = existing.versions.find((ver) => ver.current)?.id !== payload.baseVersionId;
              sharedFiles[existingIdx] = {
                ...existing,
                versions: [v, ...existing.versions.map((old) => ({ ...old, current: branched ? old.current : false }))],
              };
            } else {
              sharedFiles.unshift({
                id: fileId,
                name: payload.name,
                type: payload.type || "doc",
                uploader: payload.uploader,
                avatar: (payload.uploader || "팀").slice(0, 1),
                date: new Date().toISOString().slice(0, 10),
                size: `${buffer.length} B`,
                tag: payload.tag || "기타",
                tags: payload.tags || [],
                folderId: payload.folderId ?? null,
                comments: [],
                versions: [v],
              });
            }

            // 실시간 큐에 파일 목록 갱신 이벤트 푸시
            pushRealtimeMessage({ kind: "files-sync", files: [...sharedFiles] });

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ fileId, versionId: id }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
        return;
      }

      // 5. 파일 바이너리 다운로드
      if (url.pathname.startsWith("/fixture-api/file/")) {
        const id = Number(url.pathname.split("/").pop());
        const buf = sharedBlobs.get(id);
        if (!buf) {
          res.statusCode = 404;
          res.end("File not found");
          return;
        }
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache, no-store");
        res.end(buf);
        return;
      }

      next();
    });
  },
});

const server = await createServer({
  configFile: false,
  plugins: [apiPlugin(), react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("/fixture-api"),
  },
  resolve: {
    alias: [
      { find: /^(\.\.\/|\.\.\/\.\.\/|@\/)?context\/ProjectContext$/, replacement: fixture("workspace-context.tsx") },
      { find: /^(\.\.\/|\.\.\/\.\.\/|@\/)?api\/rest\/realtimeClient$/, replacement: fixture("realtime-bus.ts") },
      { find: "../context/ProjectContext", replacement: fixture("workspace-context.tsx") },
      { find: "../api/rest/realtimeClient", replacement: fixture("realtime-bus.ts") },
    ],
  },
  server: { host: "0.0.0.0", port: 5183, strictPort: true, allowedHosts: true },
});

await server.listen();
console.log("UI fixture: http://127.0.0.1:5183/tests/fixtures/workspace.html");
