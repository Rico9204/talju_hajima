// 백업 스크립트(backup.mjs)의 계산 부분 — 테스트할 수 있게 따로 둔다.

// DATABASE_URL에서 pg_dump에 넘길 사용자·DB 이름. 비밀번호는 쓰지 않는다(컨테이너 안에서 로컬 접속).
export function dbTarget(databaseUrl) {
  let url;
  try { url = new URL(databaseUrl); } catch { throw new Error("DATABASE_URL이 올바르지 않습니다."); }
  const user = decodeURIComponent(url.username || "postgres");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL에 DB 이름이 없습니다.");
  return { user, database };
}

// 파일 이름에 쓰는 시각(로컬 시각, 정렬하면 시간 순): 20261003_014500
export function backupStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

const BACKUP_FILE = /^(talju|storage)_(\d{8}_\d{6})\.(dump|tar\.gz)$/;

// 백업 폴더의 파일 중 지울 것: 시각(묶음) 기준으로 최근 keep개만 남긴다. 백업이 아닌 파일은 건드리지 않는다.
export function expiredBackups(fileNames, keep) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error("BACKUP_KEEP은 1 이상의 정수여야 합니다.");
  const stamps = [...new Set(fileNames.map((name) => BACKUP_FILE.exec(name)?.[2]).filter(Boolean))].sort().reverse();
  const kept = new Set(stamps.slice(0, keep));
  return fileNames.filter((name) => {
    const stamp = BACKUP_FILE.exec(name)?.[2];
    return stamp !== undefined && !kept.has(stamp);
  });
}
