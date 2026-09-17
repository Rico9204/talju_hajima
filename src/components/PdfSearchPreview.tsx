import { useEffect, useRef, useState } from "react";
import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import { getDocument } from "../lib/pdfEngine";
import { matchRanges } from "../lib/workspaceSearch";
import "./pdfSearchPreview.css";

export default function PdfSearchPreview({ source, query }: { source: string; query: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(300);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(100, element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setPdf(null); setPageNumber(1); setError(""); setBusy(true);
    const task = getDocument({ url: source });
    void task.promise.then((document) => { if (!cancelled) setPdf(document); }).catch(() => {
      if (!cancelled) { setError("PDF를 표시하지 못했습니다. 원본을 다운로드해 확인해 주세요."); setBusy(false); }
    });
    return () => { cancelled = true; void task.destroy(); };
  }, [source]);
  useEffect(() => {
    if (!pdf || !host.current) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    let layer: TextLayer | undefined;
    const element = host.current;
    element.replaceChildren(); setBusy(true); setError("");
    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const scale = Math.min(1.5, width / page.getViewport({ scale: 1 }).width);
      const viewport = page.getViewport({ scale });
      const wrapper = document.createElement("div");
      wrapper.className = "workspace-pdf-page";
      wrapper.style.width = `${viewport.width}px`; wrapper.style.height = `${viewport.height}px`;
      wrapper.style.setProperty("--total-scale-factor", String(scale * viewport.userUnit));
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      wrapper.append(canvas); element.append(wrapper);
      render = page.render({ canvas, viewport });
      await render.promise;
      const content = await page.getTextContent();
      if (cancelled) return;
      const textElement = document.createElement("div"); textElement.className = "workspace-pdf-text";
      wrapper.append(textElement);
      layer = new TextLayer({ textContentSource: content, container: textElement, viewport });
      await layer.render();
      if (cancelled) return;
      const matches = matchRanges(layer.textContentItemsStr.join(" "), query);
      let offset = 0;
      layer.textDivs.forEach((span, i) => {
        const text = layer!.textContentItemsStr[i];
        const local = matches.filter((m) => m.start < offset + text.length && m.end > offset);
        span.replaceChildren(); let cursor = 0;
        for (const match of local) {
          const start = Math.max(0, match.start - offset), end = Math.min(text.length, match.end - offset);
          span.append(document.createTextNode(text.slice(cursor, start)));
          const mark = document.createElement("mark"); mark.textContent = text.slice(start, end); span.append(mark); cursor = end;
        }
        span.append(document.createTextNode(text.slice(cursor))); offset += text.length + 1;
      });
      setBusy(false);
    })().catch(() => { if (!cancelled) { setError("이 페이지를 표시하지 못했습니다."); setBusy(false); } });
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); element.replaceChildren(); };
  }, [pdf, pageNumber, width, query]);
  return <div>
    <div className="flex items-center justify-between gap-2 text-xs mb-2">
      <button disabled={!pdf || pageNumber <= 1} onClick={() => setPageNumber((n) => n - 1)} className="disabled:opacity-40">← 이전</button>
      <span>{pageNumber} / {pdf?.numPages ?? "…"}</span>
      <button disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => setPageNumber((n) => n + 1)} className="disabled:opacity-40">다음 →</button>
    </div>
    {busy && <p role="status" className="text-xs">PDF 페이지를 불러오는 중…</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div ref={host} className="w-full overflow-auto max-h-[620px]" />
  </div>;
}
