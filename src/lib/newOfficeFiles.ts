import { emptyTemplates } from "./emptyOfficeTemplates.ts";

export type OfficeFileKind = "docx" | "xlsx" | "pptx";

export interface OfficeConfig {
  ext: "docx" | "xlsx" | "pptx";
  mime: string;
  label: string;
  icon: string;
  placeholder: string;
  defaultName: string;
}

export const OFFICE_FILE_CONFIG: Record<OfficeFileKind, OfficeConfig> = {
  docx: {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word 문서",
    icon: "📘",
    placeholder: "새 Word 문서 이름 (예: 기획서)",
    defaultName: "새 Word 문서",
  },
  xlsx: {
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel 스프레드시트",
    icon: "📗",
    placeholder: "새 Excel 스프레드시트 이름 (예: 예산안)",
    defaultName: "새 Excel 워크시트",
  },
  pptx: {
    ext: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    label: "PowerPoint 프레젠테이션",
    icon: "📙",
    placeholder: "새 PowerPoint 프레젠테이션 이름 (예: 최종발표)",
    defaultName: "새 PowerPoint 프레젠테이션",
  },
};

export function createEmptyOfficeBytes(kind: OfficeFileKind): Uint8Array {
  const b64 = emptyTemplates[kind];
  if (!b64) throw new Error(`Unknown office file kind: ${kind}`);
  const binaryString = atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
