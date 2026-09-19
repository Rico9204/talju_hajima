// Real department names are just Korean/English words — this rejects obvious
// junk (numbers, symbols, empty input) without trying to match against an
// actual list of departments, which would be impractical. The stored value
// is "학과 N학년" (department + grade, joined at join-time — see
// JoinProjectModal), so a trailing " N학년" suffix is allowed too; without
// this, re-saving a profile whose major already includes a grade would fail
// validation purely because of that digit.
export function isValidDepartmentName(value: string): boolean {
  return /^[가-힣a-zA-Z][가-힣a-zA-Z\s]{0,29}(?:\s\d{1,2}학년)?$/.test(value.trim());
}
