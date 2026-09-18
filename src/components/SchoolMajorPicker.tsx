import { useEffect, useState } from "react";
import { useMajors } from "../hooks/useMajors";

// 학교를 입력하면(입력이 잠시 멈춘 뒤) 그 학교의 실제 학과 목록을 공공데이터
// API에서 불러와 드롭다운으로 보여준다. 전국 학과가 5만 건이라 학교
// 단위로만 조회 가능 — school이 비어있으면 학과 드롭다운은 비활성.
export default function SchoolMajorPicker({
  school, onSchoolChange, major, onMajorChange,
}: {
  school: string;
  onSchoolChange: (school: string) => void;
  major: string;
  onMajorChange: (major: string) => void;
}) {
  const [debouncedSchool, setDebouncedSchool] = useState(school);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSchool(school.trim()), 500);
    return () => clearTimeout(timer);
  }, [school]);

  const { majors, loading, error } = useMajors(debouncedSchool);

  return (
    <>
      <label className="text-xs font-600 block mb-1.5">학교</label>
      <input
        value={school}
        onChange={(e) => { onSchoolChange(e.target.value); onMajorChange(""); }}
        placeholder="예: 동명대학교"
        className="w-full text-sm px-3 py-2.5 outline-none mb-3"
        style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
      />

      <label className="text-xs font-600 block mb-1.5">학과</label>
      {error ? (
        <div className="text-xs mb-3 px-3 py-2" style={{ background: "#ef444412", color: "#ef4444", borderRadius: "10px" }}>
          학과 목록을 불러오지 못했습니다. 학교명을 다시 확인해주세요.
        </div>
      ) : (
        <select
          value={major}
          onChange={(e) => onMajorChange(e.target.value)}
          disabled={!debouncedSchool || loading || majors.length === 0}
          className="w-full text-sm px-3 py-2.5 outline-none mb-3"
          style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
        >
          <option value="" disabled>
            {!debouncedSchool
              ? "먼저 학교를 입력하세요"
              : loading
                ? "학과 목록 불러오는 중…"
                : majors.length === 0
                  ? "일치하는 학교를 찾지 못했어요"
                  : "학과를 선택하세요"}
          </option>
          {majors.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
    </>
  );
}
