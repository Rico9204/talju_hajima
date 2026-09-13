import { useState } from "react";
import type { Project } from "../api/types";

export default function JoinProjectModal({
  onCancel, onJoined, lookupProject, joinProject,
}: {
  onCancel: () => void;
  onJoined: () => void;
  lookupProject: (projectId: string) => Promise<Project | null>;
  joinProject: (projectId: string, input: { major: string; student: string }) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState("");
  const [preview, setPreview] = useState<{ id: string; name: string; org: string } | null>(null);
  const [department, setDepartment] = useState("");
  const [grade, setGrade] = useState("1");
  const [student, setStudent] = useState("");
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real department names are just Korean/English words — this rejects
  // obvious junk (numbers, symbols, empty input) without trying to match
  // against an actual list of departments, which would be impractical.
  const departmentTrimmed = department.trim();
  const departmentValid = /^[가-힣a-zA-Z][가-힣a-zA-Z\s]{1,29}$/.test(departmentTrimmed);

  async function checkCode() {
    const trimmed = projectId.trim();
    if (!trimmed) return;
    setChecking(true);
    setError(null);
    setPreview(null);
    try {
      const found = await lookupProject(trimmed);
      if (!found) {
        setError("해당 참여 코드의 프로젝트를 찾을 수 없어요.");
      } else {
        setPreview(found);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "프로젝트를 확인하지 못했습니다.");
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (!preview || joining || !departmentValid) return;
    setJoining(true);
    setError(null);
    try {
      await joinProject(preview.id, { major: `${departmentTrimmed} ${grade}학년`, student });
      onJoined();
    } catch (err) {
      setError(err instanceof Error ? err.message : "참여하지 못했습니다.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(15,18,53,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="w-[26rem] max-w-[92vw] p-6"
        style={{ background: "var(--card)", borderRadius: "var(--radius)", boxShadow: "0 24px 64px rgba(15,18,53,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="w-10 h-10 flex items-center justify-center text-lg font-700 mb-3"
          style={{ background: "#2563eb18", color: "var(--primary)", borderRadius: "12px" }}
        >
          →
        </div>
        <h3 className="font-700 mb-1">프로젝트 참여하기</h3>
        <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
          팀장에게 받은 참여 코드(프로젝트 주소의 마지막 부분)를 입력하면 그 프로젝트에 팀원으로 합류합니다.
        </p>

        <label className="text-xs font-600 block mb-1.5">참여 코드</label>
        <div className="flex gap-2 mb-3">
          <input
            autoFocus
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setPreview(null); }}
            onKeyDown={(e) => e.key === "Enter" && checkCode()}
            placeholder="예: heritage-1a2b3c"
            className="flex-1 min-w-0 text-sm px-3 py-2.5 outline-none"
            style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-jetbrains)" }}
          />
          <button
            onClick={checkCode}
            disabled={!projectId.trim() || checking}
            className="px-3.5 text-sm font-700 shrink-0"
            style={{ background: "var(--muted)", borderRadius: "10px", color: "var(--foreground)" }}
          >
            {checking ? "확인 중…" : "확인"}
          </button>
        </div>

        {error && (
          <div className="text-xs mb-3 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "10px" }}>
            {error}
          </div>
        )}

        {preview && (
          <>
            <div className="flex items-center gap-2.5 mb-4 px-3 py-2.5" style={{ background: "#22c55e12", borderRadius: "10px" }}>
              <span className="text-sm" style={{ color: "#22c55e" }}>✓</span>
              <div className="min-w-0">
                <div className="text-sm font-700 truncate">{preview.name}</div>
                <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{preview.org}</div>
              </div>
            </div>

            <label className="text-xs font-600 block mb-1.5">학과 / 학년</label>
            <div className="flex gap-2 mb-1.5">
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="예: 컴퓨터공학과"
                className="flex-1 min-w-0 text-sm px-3 py-2.5 outline-none"
                style={{
                  border: `2px solid ${department.length > 0 && !departmentValid ? "#ef4444" : "var(--border)"}`,
                  borderRadius: "10px",
                  background: "var(--muted)",
                  fontFamily: "var(--font-outfit)",
                }}
              />
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="text-sm px-3 py-2.5 outline-none shrink-0"
                style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
              >
                {["1", "2", "3", "4", "5", "6"].map((g) => (
                  <option key={g} value={g}>{g}학년</option>
                ))}
              </select>
            </div>
            {department.length > 0 && !departmentValid && (
              <div className="text-xs mb-1.5" style={{ color: "#ef4444" }}>학과 이름은 한글/영문으로 입력해주세요.</div>
            )}

            <label className="text-xs font-600 block mb-1.5 mt-3">학번</label>
            <input
              value={student}
              onChange={(e) => setStudent(e.target.value)}
              placeholder="예: 2021123456"
              className="w-full text-sm px-3 py-2.5 outline-none mb-5"
              style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-jetbrains)" }}
            />
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-600"
            style={{ background: "var(--muted)", borderRadius: "40px", color: "var(--muted-foreground)" }}
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={!preview || joining || !departmentValid}
            className="flex-1 py-2.5 text-sm font-700 transition-all"
            style={{
              background: preview && !joining && departmentValid ? "var(--primary)" : "var(--border)",
              color: preview && !joining && departmentValid ? "#fff" : "var(--muted-foreground)",
              borderRadius: "40px",
              boxShadow: preview && !joining && departmentValid ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
              cursor: preview && !joining && departmentValid ? "pointer" : "not-allowed",
            }}
          >
            {joining ? "참여 중…" : "참여하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
