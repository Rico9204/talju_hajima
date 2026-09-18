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
  if (/\.(docx|xlsx|xlsm|pptx)$/i.test(file.name)) {
    try {
      const { parseOffice } = await import("officeparser");
      // XLSM is the same OOXML workbook structure as XLSX. Rename only the
      // parser input so macro code is never executed and OfficeParser routes
      // the workbook through its XLSX reader.
      const parserFile = /\.xlsm$/i.test(file.name)
        ? new File([file], file.name.replace(/\.xlsm$/i, ".xlsx"), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
        : file;
      const document = await parseOffice(parserFile, { includeRawContent: false });
      const extracted = await document.to("text");
      const text = extracted.value.replace(/\0/g, "");
      return { text: text.slice(0, MAX_SEARCH_TEXT), status: text.length > MAX_SEARCH_TEXT ? "partial" : "ready" };
    } catch {
      // Some browser builds expose File as a BlobLike without its extension.
      // Retry with bytes so content sniffing can still identify the workbook.
      try {
        const { parseOffice } = await import("officeparser");
        const document = await parseOffice(await file.arrayBuffer(), { includeRawContent: false });
        const extracted = await document.to("text");
        const text = extracted.value.replace(/\0/g, "");
        return { text: text.slice(0, MAX_SEARCH_TEXT), status: text.length > MAX_SEARCH_TEXT ? "partial" : "ready" };
      } catch { return { text: "", status: "failed" }; }
    }
  }
  if (/\.(txt|md|csv|json|js|jsx|ts|tsx|css|html|xml|yml|yaml|sql|log)$/i.test(file.name)) {
    try {
      const text = (await file.slice(0, 1_000_000).text()).replace(/\0/g, "");
      return { text: text.slice(0, MAX_SEARCH_TEXT), status: file.size > 1_000_000 || text.length > MAX_SEARCH_TEXT ? "partial" : "ready" };
    } catch { return { text: "", status: "failed" }; }
  }
  return { text: "", status: "unsupported" };
}
