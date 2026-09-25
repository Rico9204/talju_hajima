import type { Editor, JSONContent } from "@tiptap/react";

// .rtdoc(TipTap JSON)를 진짜 .docx/.pdf로 내보낸다. 두 라이브러리(docx, jspdf+html2canvas) 다
// 꽤 무거워서(번들에 계속 들고 있을 필요 없음) 내보내기 버튼을 실제로 눌렀을 때만 동적 import한다.

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const comma = dataUrl.indexOf(",");
  const mimeMatch = dataUrl.slice(0, comma).match(/^data:(.*?)(;base64)?$/);
  const mime = mimeMatch?.[1] || "image/png";
  const binaryString = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return { bytes, mime };
}

const MAX_DOCX_IMAGE_WIDTH = 500;

async function inlineRunsToDocx(
  nodes: JSONContent[] | undefined,
  docx: typeof import("docx"),
  forceItalic = false,
): Promise<any[]> {
  const runs: any[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "text") {
      const marks = node.marks ?? [];
      const isCode = marks.some((m) => m.type === "code");
      const linkMark = marks.find((m) => m.type === "link");
      const run = new docx.TextRun({
        text: node.text ?? "",
        bold: marks.some((m) => m.type === "bold"),
        italics: forceItalic || marks.some((m) => m.type === "italic"),
        strike: marks.some((m) => m.type === "strike"),
        underline: marks.some((m) => m.type === "underline") ? {} : undefined,
        font: isCode ? "Consolas" : undefined,
        shading: isCode ? { fill: "F3F4F6" } : undefined,
        color: linkMark ? "2563EB" : undefined,
      });
      if (linkMark?.attrs?.href) {
        runs.push(new docx.ExternalHyperlink({ link: linkMark.attrs.href, children: [run] }));
      } else {
        runs.push(run);
      }
    } else if (node.type === "hardBreak") {
      runs.push(new docx.TextRun({ text: "", break: 1 }));
    }
  }
  return runs;
}

const HEADING_LEVELS = ["HEADING_1", "HEADING_2", "HEADING_3", "HEADING_4", "HEADING_5", "HEADING_6"] as const;

async function listToParagraphs(node: JSONContent, ordered: boolean, depth: number, docx: typeof import("docx")): Promise<any[]> {
  const out: any[] = [];
  const items = node.content ?? [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    for (const child of item.content ?? []) {
      if (child.type === "paragraph") {
        out.push(
          new docx.Paragraph({
            children: await inlineRunsToDocx(child.content, docx),
            indent: { left: 360 + depth * 360 },
            bullet: ordered ? undefined : { level: depth },
            numbering: ordered ? { reference: "export-ordered-list", level: depth } : undefined,
          }),
        );
      } else if (child.type === "bulletList") {
        out.push(...(await listToParagraphs(child, false, depth + 1, docx)));
      } else if (child.type === "orderedList") {
        out.push(...(await listToParagraphs(child, true, depth + 1, docx)));
      }
    }
  }
  return out;
}

async function blockToParagraphs(node: JSONContent, docx: typeof import("docx")): Promise<any[]> {
  switch (node.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, node.attrs?.level ?? 1));
      return [
        new docx.Paragraph({
          heading: (docx.HeadingLevel as any)[HEADING_LEVELS[level - 1]],
          children: await inlineRunsToDocx(node.content, docx),
        }),
      ];
    }
    case "paragraph":
      return [new docx.Paragraph({ children: await inlineRunsToDocx(node.content, docx) })];
    case "bulletList":
      return listToParagraphs(node, false, 0, docx);
    case "orderedList":
      return listToParagraphs(node, true, 0, docx);
    case "blockquote": {
      const out: any[] = [];
      for (const child of node.content ?? []) {
        if (child.type === "paragraph") {
          out.push(
            new docx.Paragraph({
              children: await inlineRunsToDocx(child.content, docx, true),
              indent: { left: 480 },
              border: { left: { style: docx.BorderStyle.SINGLE, size: 12, color: "CBD5E1", space: 8 } },
            }),
          );
        }
      }
      return out;
    }
    case "codeBlock": {
      const text = (node.content ?? []).map((t) => t.text ?? "").join("");
      return text.split("\n").map(
        (line) =>
          new docx.Paragraph({
            children: [new docx.TextRun({ text: line || " ", font: "Consolas", size: 20 })],
            shading: { fill: "F3F4F6" },
          }),
      );
    }
    case "image": {
      const src = node.attrs?.src as string | undefined;
      if (!src || !src.startsWith("data:")) return [];
      try {
        const img = await loadImage(src);
        const { bytes, mime } = dataUrlToBytes(src);
        const type = mime.includes("png") ? "png" : mime.includes("gif") ? "gif" : "jpg";
        const width = Math.min(MAX_DOCX_IMAGE_WIDTH, img.naturalWidth || MAX_DOCX_IMAGE_WIDTH);
        const height = Math.round(width * ((img.naturalHeight || width) / (img.naturalWidth || width)));
        return [
          new docx.Paragraph({
            children: [new docx.ImageRun({ type: type as any, data: bytes, transformation: { width, height } })],
          }),
        ];
      } catch {
        return [];
      }
    }
    case "horizontalRule":
      return [new docx.Paragraph({ border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: "999999" } } })];
    default:
      return [];
  }
}

export async function exportRichDocAsDocx(editor: Editor, filename: string): Promise<void> {
  const docx = await import("docx");
  const json = editor.getJSON();
  const paragraphs: any[] = [];
  for (const node of json.content ?? []) {
    paragraphs.push(...(await blockToParagraphs(node, docx)));
  }
  const doc = new docx.Document({
    numbering: {
      config: [
        {
          reference: "export-ordered-list",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: docx.LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: docx.AlignmentType.START,
            style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } } },
          })),
        },
      ],
    },
    sections: [{ children: paragraphs.length > 0 ? paragraphs : [new docx.Paragraph({})] }],
  });
  const blob = await docx.Packer.toBlob(doc);
  triggerDownload(blob, filename);
}

// 화면에 보이는 그대로(overflow 없이) 캡처해서 A4 페이지에 나눠 담는다 — 실제 렌더링된 서식을
// 그대로 반영하므로 별도 레이아웃 로직 없이도 화면과 PDF가 항상 일치한다.
export async function exportElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  // rich-doc-prose는 모달 레이아웃상 min-height:100%로 남은 빈 공간까지 늘어나 있다 — 그대로
  // 캡처하면 글자 몇 줄짜리 문서도 캔버스가 모달 높이만큼 커져서 파일이 불필요하게 커진다.
  // 캡처 직전만 min-height를 없애 실제 내용 높이만큼만 잡히게 한 뒤 원래대로 되돌린다.
  const prevMinHeight = element.style.minHeight;
  element.style.minHeight = "0px";
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(element, { scale: 1.5, backgroundColor: "#ffffff", useCORS: true });
  } finally {
    element.style.minHeight = prevMinHeight;
  }
  const pdf = new jsPDF({ unit: "px", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.85);

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(filename);
}
