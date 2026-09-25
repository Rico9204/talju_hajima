// .slides(이 앱 자체 슬라이드 포맷)를 진짜 .pptx/.pdf로 내보낸다.
// pptx: 텍스트박스/이미지를 좌표 그대로(퍼센트 -> 인치) 옮겨서 진짜 편집 가능한 pptx로 만든다.
// pdf: 화면에 보이는 슬라이드 캔버스를 그대로 캡처해서(html2canvas) 슬라이드 1장 = PDF 1페이지로 담는다.

export interface ExportElement {
  id: string;
  type: "text" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  src?: string;
}

export interface ExportSlide {
  id: string;
  elements: ExportElement[];
}

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

const SLIDE_WIDTH_IN = 13.333;
const SLIDE_HEIGHT_IN = 7.5;

export async function exportSlidesAsPptx(slides: ExportSlide[], filename: string): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "COLLAB_WIDE", width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = "COLLAB_WIDE";

  for (const slide of slides) {
    const pptxSlide = pptx.addSlide();
    for (const el of slide.elements) {
      const x = (el.x / 100) * SLIDE_WIDTH_IN;
      const y = (el.y / 100) * SLIDE_HEIGHT_IN;
      const w = (el.w / 100) * SLIDE_WIDTH_IN;
      const h = (el.h / 100) * SLIDE_HEIGHT_IN;
      if (el.type === "image" && el.src) {
        pptxSlide.addImage({ data: el.src.replace(/^data:/, ""), x, y, w, h });
      } else if (el.type === "text") {
        pptxSlide.addText(el.text ?? "", {
          x,
          y,
          w,
          h,
          fontSize: Math.max(10, el.w * 0.16),
          color: "111111",
          fontFace: "Arial",
          valign: "top",
          wrap: true,
        });
      }
    }
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  triggerDownload(blob, filename);
}

// slideElement: 지금 화면에 렌더링된 그 슬라이드의 캔버스 DOM(16:9 비율의 루트 div) — 호출 전에
// 선택/편집 오버레이(삭제 버튼, 리사이즈 핸들, textarea)가 안 보이는 상태여야 깨끗하게 캡처된다.
export async function captureSlideAsImage(slideElement: HTMLElement): Promise<{ dataUrl: string; width: number; height: number }> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(slideElement, { scale: 1.5, backgroundColor: "#ffffff", useCORS: true });
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height };
}

export async function buildSlidesPdf(images: { dataUrl: string; width: number; height: number }[], filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  if (images.length === 0) return;
  const first = images[0];
  const pdf = new jsPDF({ unit: "px", format: [first.width, first.height], orientation: first.width >= first.height ? "landscape" : "portrait" });
  images.forEach((img, i) => {
    if (i > 0) pdf.addPage([img.width, img.height], img.width >= img.height ? "landscape" : "portrait");
    pdf.addImage(img.dataUrl, "JPEG", 0, 0, img.width, img.height);
  });
  pdf.save(filename);
}
