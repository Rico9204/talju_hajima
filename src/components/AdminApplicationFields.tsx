import { useState } from "react";
import type { AdminApplicationInput, AdminDocType } from "../api/types";
import { ADMIN_DOC_TYPES, formatFileSize, validateAdminDocument } from "../lib/adminApplication";

const inputStyle = { border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" };

// 가입 폼(관리자 가입 탭)과 관리자 신청서 화면이 같은 입력 항목을 쓰도록 상태와 검증을 한곳에 둔다.
export function useAdminApplicationForm() {
  const [org, setOrg] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [contact, setContact] = useState("");
  const [docType, setDocType] = useState<AdminDocType>("employment");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  const ready = !!(org.trim() && jobTitle.trim() && contact.trim().length >= 3 && file && !fileError && consent);

  return {
    org, setOrg, jobTitle, setJobTitle, contact, setContact, docType, setDocType, file, fileError, consent, setConsent, ready,
    onFileChange(next: File | null) {
      setFile(next);
      setFileError(next ? validateAdminDocument(next) : null);
    },
    // 제출할 값. 필수 항목이 비었으면 null.
    input(): AdminApplicationInput | null {
      if (!ready || !file) return null;
      return { org: org.trim(), jobTitle: jobTitle.trim(), contact: contact.trim(), docType, file, consent };
    },
    // 자동 제출이 실패했을 때 입력값을 채워 다시 시도할 수 있게 한다.
    load(draft: AdminApplicationInput) {
      setOrg(draft.org);
      setJobTitle(draft.jobTitle);
      setContact(draft.contact);
      setDocType(draft.docType);
      setFile(draft.file);
      setFileError(validateAdminDocument(draft.file));
      setConsent(draft.consent);
    },
  };
}
export type AdminApplicationForm = ReturnType<typeof useAdminApplicationForm>;

export default function AdminApplicationFields({ form }: { form: AdminApplicationForm }) {
  return (
    <>
      <label className="text-xs font-600 block mb-1.5">소속</label>
      <input value={form.org} maxLength={100} onChange={(e) => form.setOrg(e.target.value)} placeholder="예: OO대학교 컴퓨터공학과" className="w-full text-sm px-3 py-2.5 outline-none mb-3" style={inputStyle} />

      <label className="text-xs font-600 block mb-1.5">직위</label>
      <input value={form.jobTitle} maxLength={60} onChange={(e) => form.setJobTitle(e.target.value)} placeholder="예: 교수, 부교수, 조교수, 강사" className="w-full text-sm px-3 py-2.5 outline-none mb-3" style={inputStyle} />

      <label className="text-xs font-600 block mb-1.5">
        연락처 <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>(운영자가 확인할 때 사용해요)</span>
      </label>
      <input value={form.contact} maxLength={60} onChange={(e) => form.setContact(e.target.value)} placeholder="전화번호 또는 학교 이메일" className="w-full text-sm px-3 py-2.5 outline-none mb-3" style={inputStyle} />

      <label className="text-xs font-600 block mb-1.5">증명서 종류</label>
      <select value={form.docType} onChange={(e) => form.setDocType(e.target.value as AdminDocType)} className="w-full text-sm px-3 py-2.5 outline-none mb-3" style={inputStyle}>
        {ADMIN_DOC_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      <label className="text-xs font-600 block mb-1.5">
        증명서 PDF <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>(10MB 이하)</span>
      </label>
      <input type="file" accept="application/pdf,.pdf" onChange={(e) => form.onFileChange(e.target.files?.[0] ?? null)} className="w-full text-xs mb-1.5" />
      {form.file && !form.fileError && <div className="text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>{form.file.name} · {formatFileSize(form.file.size)}</div>}
      {form.fileError && <div role="alert" className="text-xs mb-1.5" style={{ color: "#ef4444" }}>{form.fileError}</div>}
      <div className="text-xs mb-4 p-3" style={{ background: "#f59e0b12", color: "var(--foreground)", borderRadius: "10px", lineHeight: 1.6 }}>
        <strong>주민등록번호 등 확인에 필요 없는 정보는 가려서 제출해 주세요.</strong> 제출한 증명서는 운영자만 볼 수 있고, 심사가 끝나면 파일이 삭제됩니다.
      </div>

      <label className="flex items-start gap-2 text-xs mb-1">
        <input type="checkbox" checked={form.consent} onChange={(e) => form.setConsent(e.target.checked)} className="mt-0.5" />
        <span>개인정보 수집·이용에 동의합니다. (필수)</span>
      </label>
      <ul className="text-xs mb-4 pl-6 list-disc" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        <li>수집 항목: 소속, 직위, 연락처, 증명서 PDF</li>
        <li>이용 목적: 교수·교원 신분 확인과 관리자 권한 부여 심사</li>
        <li>보관: 증명서 파일은 심사 완료 즉시 삭제하고, 신청·처리 기록(파일 없이)은 남깁니다.</li>
      </ul>
    </>
  );
}
