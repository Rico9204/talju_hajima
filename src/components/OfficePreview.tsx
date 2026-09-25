import { useEffect, useRef, useState } from "react";

// 워드/엑셀/PDF처럼 업로드된 바이너리 오피스 파일을 서버 변환 없이 브라우저에서 바로 미리보기.
// 라이브러리가 꽤 무거워서(mammoth/xlsx/pdfjs) 번들에 항상 포함하지 않고 실제로 그 확장자
// 파일을 미리볼 때만 동적 import한다.

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(",");
  const binaryString = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

function PreviewStatus({ text }: { text: string }) {
  return <span style={{ opacity: 0.7 }}>{text}</span>;
}

function UnsupportedPreview() {
  return <PreviewStatus text='미리보기를 지원하지 않는 파일이에요. 더블클릭하거나 "전체 내용 보기"로 다운로드하세요.' />;
}

function DocxPreview({ content }: { content: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    import("mammoth")
      .then((mammoth) => mammoth.convertToHtml({ arrayBuffer: dataUrlToArrayBuffer(content) }))
      .then((result) => {
        if (!cancelled) setHtml(result.value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (failed) return <UnsupportedPreview />;
  if (html === null) return <PreviewStatus text="미리보기를 불러오는 중..." />;
  return <div className="office-preview-docx" dangerouslySetInnerHTML={{ __html: html }} />;
}

function SheetPreview({ content }: { content: string }) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setFailed(false);
    import("xlsx")
      .then((XLSX) => {
        const workbook = XLSX.read(dataUrlToArrayBuffer(content), { type: "array" });
        const parsed = workbook.SheetNames.map((name) => ({
          name,
          html: XLSX.utils.sheet_to_html(workbook.Sheets[name], { header: "", footer: "" }),
        }));
        if (!cancelled) {
          setSheets(parsed);
          setActiveSheet(0);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (failed) return <UnsupportedPreview />;
  if (sheets === null) return <PreviewStatus text="미리보기를 불러오는 중..." />;
  if (sheets.length === 0) return <PreviewStatus text="시트가 없는 파일이에요." />;

  return (
    <div className="office-preview-sheet">
      {sheets.length > 1 && (
        <div className="flex gap-1 mb-1.5 flex-wrap">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActiveSheet(i)}
              className="text-xs font-600 px-2 py-0.5"
              style={{
                borderRadius: "6px",
                background: i === activeSheet ? "var(--primary)" : "var(--muted)",
                color: i === activeSheet ? "#fff" : "var(--foreground)",
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="office-preview-sheet-table" dangerouslySetInnerHTML={{ __html: sheets[activeSheet]?.html ?? "" }} />
    </div>
  );
}

function PdfPreview({ content }: { content: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<{ numPages: number; getPage: (n: number) => Promise<any> } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    pdfDocRef.current = null;
    (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
      const pdf = await pdfjsLib.getDocument({ data: dataUrlToArrayBuffer(content) }).promise;
      if (cancelled) return;
      pdfDocRef.current = pdf;
      setNumPages(pdf.numPages);
      setPageNum(1);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setFailed(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [content]);

  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || loading) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDocRef.current!.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pageNum, loading]);

  if (failed) return <UnsupportedPreview />;
  if (loading) return <PreviewStatus text="미리보기를 불러오는 중..." />;

  return (
    <div className="office-preview-pdf">
      <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto", border: "1px solid var(--border)", borderRadius: "6px" }} />
      {numPages > 1 && (
        <div className="flex items-center gap-2 mt-1.5 text-xs">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPageNum((p) => Math.max(1, p - 1));
            }}
            disabled={pageNum <= 1}
            className="px-2 py-0.5 font-600"
            style={{ borderRadius: "6px", background: "var(--muted)", opacity: pageNum <= 1 ? 0.4 : 1 }}
          >
            이전
          </button>
          <span>
            {pageNum} / {numPages}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPageNum((p) => Math.min(numPages, p + 1));
            }}
            disabled={pageNum >= numPages}
            className="px-2 py-0.5 font-600"
            style={{ borderRadius: "6px", background: "var(--muted)", opacity: pageNum >= numPages ? 0.4 : 1 }}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

const PREVIEWABLE_EXTENSIONS = new Set(["docx", "xlsx", "xls", "pdf"]);

export function isOfficePreviewablePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return PREVIEWABLE_EXTENSIONS.has(ext);
}

export default function OfficePreview({ path, content }: { path: string; content: string }) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    <>
      <style>{`
        .office-preview-docx { font-size: 12px; line-height: 1.6; }
        .office-preview-docx h1, .office-preview-docx h2, .office-preview-docx h3 { font-weight: 700; margin: 0.5em 0 0.25em; }
        .office-preview-docx p { margin: 0.35em 0; }
        .office-preview-docx ul, .office-preview-docx ol { padding-left: 1.4em; margin: 0.35em 0; }
        .office-preview-docx img { max-width: 100%; }
        .office-preview-docx table { border-collapse: collapse; margin: 0.5em 0; }
        .office-preview-docx table td, .office-preview-docx table th { border: 1px solid var(--border); padding: 3px 6px; }
        .office-preview-sheet-table table { border-collapse: collapse; font-size: 11px; }
        .office-preview-sheet-table table td, .office-preview-sheet-table table th { border: 1px solid var(--border); padding: 2px 6px; white-space: nowrap; }
      `}</style>
      {ext === "docx" ? (
        <DocxPreview content={content} />
      ) : ext === "xlsx" || ext === "xls" ? (
        <SheetPreview content={content} />
      ) : ext === "pdf" ? (
        <PdfPreview content={content} />
      ) : (
        <UnsupportedPreview />
      )}
    </>
  );
}
