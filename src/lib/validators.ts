// Real department names are just Korean/English words — this rejects obvious
// junk (numbers, symbols, empty input) without trying to match against an
// actual list of departments, which would be impractical.
export function isValidDepartmentName(value: string): boolean {
  return /^[가-힣a-zA-Z][가-힣a-zA-Z\s]{1,29}$/.test(value.trim());
}
