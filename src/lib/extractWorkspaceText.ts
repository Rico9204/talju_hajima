import { MAX_SEARCH_TEXT, type ExtractedText } from "./workspaceSearch";

export async function extractWorkspaceText(file: File): Promise<ExtractedText> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const { getDocument } = await import("./pdfEngine");
    const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const timeout = window.setTimeout(() => { void task.destroy(); }, 30_000);
    try {
      const pdf = await task.promise;
      let text = "";
      let pages = 0;
      for (; pages < Math.min(pdf.numPages, 100) && text.length < MAX_SEARCH_TEXT; pages++) {
        const page = await pdf.getPage(pages + 1);
        const content = await page.getTextContent();
        text += content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("") + "\n";
        page.cleanup();
      }
      return { text: text.slice(0, MAX_SEARCH_TEXT).replace(/\0/g, ""), status: pages < pdf.numPages || text.length > MAX_SEARCH_TEXT ? "partial" : "ready" };
    } catch { return { text: "", status: "failed" }; }
    finally { window.clearTimeout(timeout); await task.destroy(); }
  }
  if (/\.(txt|md|csv|json|js|jsx|ts|tsx|css|html|xml|yml|yaml|sql|log)$/i.test(file.name)) {
    try {
      const text = (await file.slice(0, 1_000_000).text()).replace(/\0/g, "");
      return { text: text.slice(0, MAX_SEARCH_TEXT), status: file.size > 1_000_000 || text.length > MAX_SEARCH_TEXT ? "partial" : "ready" };
    } catch { return { text: "", status: "failed" }; }
  }
  return { text: "", status: "unsupported" };
}
