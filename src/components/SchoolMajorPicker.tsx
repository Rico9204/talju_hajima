import { useEffect, useState } from "react";
import { useMajors } from "../hooks/useMajors";

// 학교를 입력하면(입력이 잠시 멈춘 뒤) 그 학교의 실제 학과 목록을 공공데이터
// API에서 불러와 드롭다운으로 보여준다. 전국 학과가 5만 건이라 학교
// 단위로만 조회 가능 — school이 비어있으면 학과 드롭다운은 비활성.
// 학과 목록이 없거나(공공데이터에 없는 학교·조회 실패) 목록에 원하는 학과가 없으면 직접 입력한다
// (학과가 참여에 필수라, 예전엔 목록이 빈 학교의 학생은 참여할 수 없었다).
const MANUAL = "__manual__";
const inputStyle = { border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" };
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
  const [manualChosen, setManualChosen] = useState(false);
  const noList = !!debouncedSchool && !loading && (!!error || majors.length === 0);
  const manual = noList || manualChosen;

  return (
    <>
      <label className="text-xs font-600 block mb-1.5">학교</label>
      <input
        value={school}
        onChange={(e) => { onSchoolChange(e.target.value); onMajorChange(""); setManualChosen(false); }}
        placeholder="예: 동명대학교"
        className="w-full text-sm px-3 py-2.5 outline-none mb-3"
        style={{ border: "2px solid var(--border)", borderRadius: "10px", background: "var(--muted)", fontFamily: "var(--font-outfit)" }}
      />

      <label className="text-xs font-600 block mb-1.5">학과</label>
      {!manual && (
        <select
          value={major}
          onChange={(e) => {
            if (e.target.value === MANUAL) { setManualChosen(true); onMajorChange(""); }
            else onMajorChange(e.target.value);
          }}
          disabled={!debouncedSchool || loading}
          className="w-full text-sm px-3 py-2.5 outline-none mb-3"
          style={inputStyle}
        >
          <option value="" disabled>
            {!debouncedSchool ? "먼저 학교를 입력하세요" : loading ? "학과 목록 불러오는 중…" : "학과를 선택하세요"}
          </option>
          {majors.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value={MANUAL}>목록에 없어요 (직접 입력)</option>
        </select>
      )}
      {manual && (
        <>
          <div className="text-xs mb-1.5 px-3 py-2" style={{ background: noList ? "#f0a50014" : "var(--muted)", color: noList ? "#b07800" : "var(--muted-foreground)", borderRadius: "10px" }}>
            {error
              ? "학과 목록을 불러오지 못했어요. 학과 이름을 직접 입력해 주세요."
              : noList
                ? "이 학교의 학과 목록을 찾지 못했어요. 학교명을 확인하거나 학과 이름을 직접 입력해 주세요."
                : "학과 이름을 직접 입력해 주세요."}
          </div>
          <input
            value={major}
            onChange={(e) => onMajorChange(e.target.value)}
            maxLength={40}
            placeholder="예: 컴퓨터공학과"
            className="w-full text-sm px-3 py-2.5 outline-none mb-1.5"
            style={inputStyle}
          />
          {!noList && (
            <button type="button" onClick={() => { setManualChosen(false); onMajorChange(""); }} className="text-xs underline mb-3" style={{ color: "var(--muted-foreground)" }}>
              목록에서 고르기
            </button>
          )}
          {noList && <div className="mb-3" />}
        </>
      )}
    </>
  );
}
